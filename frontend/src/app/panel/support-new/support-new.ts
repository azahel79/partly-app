import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { GroupsService } from '../../shared/groups.service';
import { IncidentsService } from '../../shared/incidents.service';
import { AuthService } from '../../shared/auth.service';
import { Group } from '../../shared/groups.models';

interface MembershipOption {
  membershipId: string;
  group: Group;
}

@Component({
  imports: [RouterLink],
  selector: 'app-support-new',
  templateUrl: './support-new.html',
})
export class SupportNew implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly incidentsService = inject(IncidentsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly options = signal<MembershipOption[] | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly selectedMembershipId = signal<string | null>(null);
  protected readonly subject = signal('');
  protected readonly message = signal('');

  ngOnInit(): void {
    const userId = this.authService.currentUser()?.id;
    this.groupsService
      .findJoined()
      .pipe(
        switchMap((groups) => {
          if (groups.length === 0) {
            return of([] as MembershipOption[]);
          }
          return forkJoin(
            groups.map((group) =>
              this.groupsService.findMembers(group.id).pipe(
                map((members) => {
                  const own = members.find((m) => m.user.id === userId);
                  return own ? { membershipId: own.id, group } : null;
                }),
              ),
            ),
          ).pipe(map((results) => results.filter((r): r is MembershipOption => r !== null)));
        }),
      )
      .subscribe({
        next: (opts) => {
          this.options.set(opts);
          if (opts.length > 0) {
            this.selectedMembershipId.set(opts[0].membershipId);
          }
        },
        error: (message: string) => this.errorMessage.set(message),
      });
  }

  protected submit(): void {
    const membershipId = this.selectedMembershipId();
    const subject = this.subject().trim();
    const message = this.message().trim();
    if (!membershipId || !subject || !message || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.incidentsService
      .create({ context: 'GROUP_MEMBERSHIP', groupMembershipId: membershipId, subject, message })
      .subscribe({
        next: (incident) => {
          this.submitting.set(false);
          this.router.navigate(['/panel/soporte', incident.id]);
        },
        error: (msg: string) => {
          this.submitting.set(false);
          this.errorMessage.set(msg);
        },
      });
  }
}
