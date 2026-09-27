import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GroupsService } from '../../shared/groups.service';
import { PaymentsService } from '../../shared/payments.service';
import { Group } from '../../shared/groups.models';
import { Payment } from '../../shared/payments.models';
import { PlatformLogo } from '../../shared/platform-logo/platform-logo';
import { RenewalToggle } from '../../shared/renewal-toggle/renewal-toggle';
import { MoneyPipe } from '../../shared/money';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

@Component({
  imports: [RouterLink, PlatformLogo, RenewalToggle, MoneyPipe],
  selector: 'app-group-payment',
  styleUrl: './group-payment.css',
  templateUrl: './group-payment.html',
})
export class GroupPayment implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly groupsService = inject(GroupsService);
  private readonly paymentsService = inject(PaymentsService);

  protected readonly group = signal<Group | null>(null);
  protected readonly notFound = signal(false);

  /** undefined = todavía no cargó; null = nada pendiente (ya aprobado); Payment = a la espera. */
  protected readonly payment = signal<Payment | null | undefined>(undefined);
  protected readonly loadError = signal<string | null>(null);
  /** Reservó cupo pero el vendedor todavía no inicia el grupo: aún no existe un pago que mostrar. */
  protected readonly reservedOnly = signal(false);
  /** No tiene un lugar en este grupo (entró a la URL sin haberlo elegido). */
  protected readonly noSeat = signal(false);

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly accountCopied = signal(false);


  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      return;
    }
    this.groupsService.findOne(id).subscribe({
      next: (group) => {
        this.group.set(group);
        this.loadPayment(id);
      },
      error: () => this.notFound.set(true),
    });
  }

  /**
   * Primero se mira en qué estado está el visitante: con el cupo solo reservado (el vendedor todavía no
   * inicia el grupo) o sin lugar no existe un pago que pedir, así que se explica en vez de pedirlo y
   * recibir un 404 (que además dejaba la pantalla cargando sin fin).
   */
  private loadPayment(groupId: string): void {
    this.groupsService.findMyMembership(groupId).subscribe({
      next: (membership) => {
        if (membership === null) {
          this.noSeat.set(true);
        } else if (membership.status === 'RESERVED') {
          this.reservedOnly.set(true);
        } else {
          this.fetchPayment(groupId);
        }
      },
      error: () => this.fetchPayment(groupId),
    });
  }

  private fetchPayment(groupId: string): void {
    this.paymentsService.findMine(groupId).subscribe({
      next: (payment) => this.payment.set(payment),
      error: (message: string) => this.loadError.set(message),
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.validateFile(file);
  }

  protected onFileDropped(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.validateFile(file);
  }

  protected copyBankAccount(accountNumber: string): void {
    navigator.clipboard.writeText(accountNumber).then(() => {
      this.accountCopied.set(true);
      setTimeout(() => this.accountCopied.set(false), 1800);
    });
  }

  private validateFile(file: File | null): void {
    this.fileError.set(null);
    if (!file) {
      this.selectedFile.set(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.fileError.set('Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF.');
      this.selectedFile.set(null);
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      this.fileError.set('El archivo no puede pesar más de 8MB.');
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
  }

  protected uploadReceipt(): void {
    const group = this.group();
    const file = this.selectedFile();
    if (!group || !file || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.uploadError.set(null);
    this.paymentsService.uploadReceipt(group.id, file).subscribe({
      next: (payment) => {
        this.uploading.set(false);
        this.payment.set(payment);
        this.selectedFile.set(null);
      },
      error: (message: string) => {
        this.uploading.set(false);
        this.uploadError.set(message);
      },
    });
  }
}
