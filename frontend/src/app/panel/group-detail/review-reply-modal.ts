import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ReviewsService } from '../../shared/reviews.service';
import { Review } from '../../shared/reviews.models';
import { UiModal } from '../../shared/ui-modal/ui-modal';

const MAX_REPLY = 500;
const MIN_REPLY = 2;

/**
 * El vendedor responde (o edita su respuesta a) una reseña. La respuesta es pública y la reseña no se puede borrar,
 * así que se escribe con la reseña completa a la vista y sabiendo que el comprador recibe un aviso.
 */
@Component({
  selector: 'app-review-reply-modal',
  imports: [UiModal],
  template: `
    <app-ui-modal #modal [title]="review().sellerReply ? 'Editar tu respuesta' : 'Responder reseña'" [subtitle]="'Reseña de ' + review().author.name" [dirty]="dirty()" [busy]="saving()" (closed)="closed.emit()">
      <figure class="review-quote">
        <div class="review-quote__head">
          <strong>{{ review().author.name }}</strong>
          <span class="review-quote__stars" [attr.aria-label]="review().rating + ' de 5 estrellas'">
            @for (star of stars; track star) {
              <span class="material-symbols-outlined" [class.is-on]="star <= review().rating">star</span>
            }
          </span>
          <small>{{ dateLabel(review().createdAt) }}</small>
        </div>
        @if (review().comment) {
          <blockquote>{{ review().comment }}</blockquote>
        } @else {
          <blockquote class="is-empty">Solo dejó su calificación, sin comentario.</blockquote>
        }
      </figure>

      <label class="ui-field">
        <span>Tu respuesta</span>
        <textarea class="ui-input" rows="4" [attr.maxlength]="max" [value]="text()" (input)="text.set($any($event.target).value)" placeholder="Ej. ¡Gracias por la confianza! Cualquier cosa con la cuenta, escríbeme por aquí."></textarea>
      </label>
      <p class="ui-field-hint reply-count" [class.is-limit]="text().length >= max">{{ text().length }}/{{ max }}</p>

      <p class="ui-note ui-note--info">
        <span class="material-symbols-outlined">public</span>
        <span>Tu respuesta será <strong>pública</strong> en el grupo, debajo de la reseña.{{ review().sellerReply ? '' : ' A ' + firstName() + ' le llega un aviso.' }} Las reseñas no se pueden borrar; si algo no fue como esperaba, responde con calma y ofrece una solución.</span>
      </p>

      @if (error()) {
        <p class="ui-note ui-note--danger"><span class="material-symbols-outlined">error</span><span>{{ error() }}</span></p>
      }

      <div modal-actions>
        <button type="button" class="ui-btn ui-btn--secondary" [disabled]="saving()" (click)="modal.close()">Cancelar</button>
        <button type="button" class="ui-btn ui-btn--primary" [disabled]="!canSubmit()" (click)="submit()">
          <span class="material-symbols-outlined">send</span>{{ saving() ? 'Publicando…' : (review().sellerReply ? 'Guardar respuesta' : 'Publicar respuesta') }}
        </button>
      </div>
    </app-ui-modal>
  `,
  styles: `
    .review-quote { margin: 0; padding: 14px 16px; border-radius: 12px; background: var(--ui-soft); }
    .review-quote__head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 13px; }
    .review-quote__head strong { color: var(--ui-text); }
    .review-quote__head small { color: var(--ui-muted); font-size: 12px; }
    .review-quote__stars { display: inline-flex; color: #d0d5dd; }
    .review-quote__stars .material-symbols-outlined { font-size: 16px; }
    .review-quote__stars .is-on { color: #f59e0b; font-variation-settings: 'FILL' 1; }
    blockquote { margin: 8px 0 0; color: var(--ui-text); font-size: 14px; line-height: 1.55; }
    blockquote.is-empty { color: var(--ui-muted); font-style: italic; }
    .reply-count { align-self: flex-end; margin-top: -10px; font-variant-numeric: tabular-nums; }
    .reply-count.is-limit { color: #b42318; }
  `,
})
export class ReviewReplyModal implements OnInit {
  private readonly reviewsService = inject(ReviewsService);

  readonly groupId = input.required<string>();
  readonly review = input.required<Review>();
  readonly saved = output<Review>();
  readonly closed = output<void>();

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly max = MAX_REPLY;
  protected readonly text = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly firstName = computed(() => this.review().author.name.trim().split(/\s+/)[0]);
  protected readonly dirty = computed(() => this.text().trim() !== (this.review().sellerReply ?? '').trim());
  protected readonly canSubmit = computed(() => !this.saving() && this.text().trim().length >= MIN_REPLY && this.dirty());

  ngOnInit(): void {
    this.text.set(this.review().sellerReply ?? '');
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.reviewsService.reply(this.groupId(), this.review().id, this.text().trim()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.saved.emit(updated);
      },
      error: (message: string) => {
        this.saving.set(false);
        this.error.set(message);
      },
    });
  }

  protected dateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
  }
}
