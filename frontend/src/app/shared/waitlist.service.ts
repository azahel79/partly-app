import { Injectable } from '@angular/core';

/**
 * Free Formspree form endpoint. Sign up at https://formspree.io (no credit card),
 * create a form, and replace YOUR_FORM_ID below with the id shown in your dashboard
 * (the part after "/f/" in the endpoint Formspree gives you).
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';

@Injectable({ providedIn: 'root' })
export class WaitlistService {
  async submit(email: string, source: string, name?: string): Promise<boolean> {
    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, source, ...(name ? { name } : {}) }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
