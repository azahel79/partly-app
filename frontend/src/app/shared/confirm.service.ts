import { Injectable } from '@angular/core';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** Acción destructiva: botón rojo y ícono de advertencia. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  text?: string;
  placeholder?: string;
  confirmText?: string;
  /** Si es true, no deja confirmar con el campo vacío. */
  required?: boolean;
}

export interface ChoiceOptions {
  title: string;
  text?: string;
  /** Acción principal (botón verde). */
  primaryText: string;
  /** Segunda opción (botón con borde). Si no se manda, solo hay principal y cancelar. */
  secondaryText?: string;
  cancelText?: string;
  /** Enlace debajo de los botones (por ejemplo "Ver mi otro grupo"). `href` debe ser una ruta interna. */
  link?: { label: string; href: string };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Reemplaza al `confirm()` nativo del navegador por un modal con el estilo de la app. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  async ask(options: ConfirmOptions): Promise<boolean> {
    const result = await Swal.fire({
      title: options.title,
      text: options.text,
      icon: options.danger ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'Aceptar',
      cancelButtonText: options.cancelText ?? 'Cancelar',
      reverseButtons: true,
      focusCancel: !!options.danger,
      buttonsStyling: false,
      customClass: {
        popup: 'vk-swal',
        title: 'vk-swal-title',
        htmlContainer: 'vk-swal-text',
        actions: 'vk-swal-actions',
        confirmButton: options.danger ? 'vk-swal-btn vk-swal-danger' : 'vk-swal-btn vk-swal-confirm',
        cancelButton: 'vk-swal-btn vk-swal-cancel',
      },
    });
    return result.isConfirmed;
  }

  /** Pide un texto (por ejemplo el motivo de un rechazo). Regresa null si se cancela. */
  async prompt(options: PromptOptions): Promise<string | null> {
    const result = await Swal.fire({
      title: options.title,
      text: options.text,
      input: 'textarea',
      inputPlaceholder: options.placeholder,
      inputAttributes: { maxlength: '300' },
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'Aceptar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      buttonsStyling: false,
      inputValidator: (value: string) => (options.required && !value.trim() ? 'Escribe un motivo.' : undefined),
      customClass: {
        popup: 'vk-swal',
        title: 'vk-swal-title',
        htmlContainer: 'vk-swal-text',
        actions: 'vk-swal-actions',
        input: 'vk-swal-input',
        confirmButton: 'vk-swal-btn vk-swal-confirm',
        cancelButton: 'vk-swal-btn vk-swal-cancel',
      },
    });
    return result.isConfirmed ? String(result.value ?? '').trim() : null;
  }

  /** Ventana con dos acciones y cancelar. Regresa cuál eligió la persona. */
  async choose(options: ChoiceOptions): Promise<'primary' | 'secondary' | 'cancel'> {
    const result = await Swal.fire({
      title: options.title,
      text: options.text,
      icon: 'info',
      showDenyButton: !!options.secondaryText,
      showCancelButton: true,
      confirmButtonText: options.primaryText,
      denyButtonText: options.secondaryText,
      cancelButtonText: options.cancelText ?? 'Cancelar',
      footer: options.link?.href.startsWith('/') ? `<a class="vk-swal-link" href="${escapeHtml(options.link.href)}">${escapeHtml(options.link.label)}</a>` : undefined,
      buttonsStyling: false,
      customClass: {
        popup: 'vk-swal vk-swal-choice',
        title: 'vk-swal-title',
        htmlContainer: 'vk-swal-text',
        actions: 'vk-swal-actions',
        confirmButton: 'vk-swal-btn vk-swal-confirm',
        denyButton: 'vk-swal-btn vk-swal-outline',
        cancelButton: 'vk-swal-btn vk-swal-cancel',
      },
    });
    return result.isConfirmed ? 'primary' : result.isDenied ? 'secondary' : 'cancel';
  }
}
