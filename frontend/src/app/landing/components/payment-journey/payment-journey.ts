import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { LandingAnalyticsService } from '../../../shared/landing-analytics.service';

interface PaymentStage {
  icon: string;
  label: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-payment-journey',
  imports: [RouterLink, RevealDirective],
  templateUrl: './payment-journey.html',
  styleUrl: './payment-journey.css',
})
export class PaymentJourney {
  private readonly analytics = inject(LandingAnalyticsService);
  protected readonly stages: PaymentStage[] = [
    {
      icon: 'calculate',
      label: 'Monto calculado',
      title: 'Sabes cuánto pagar antes de continuar',
      description: 'Partly muestra el precio del cupo y calcula el primer periodo según los días restantes.',
    },
    {
      icon: 'account_balance',
      label: 'Transferencia',
      title: 'Transfieres directamente al titular',
      description: 'Ves la referencia y los datos indicados por quien administra el plan.',
    },
    {
      icon: 'upload_file',
      label: 'Comprobante',
      title: 'Subes la evidencia del pago',
      description: 'El archivo queda asociado a la solicitud para que el estado no dependa de mensajes externos.',
    },
    {
      icon: 'fact_check',
      label: 'Revisión',
      title: 'El titular confirma el depósito',
      description: 'Partly registra la decisión. Si existe un problema, el historial permite abrir una incidencia.',
    },
    {
      icon: 'key',
      label: 'Acceso',
      title: 'Las credenciales se habilitan al aprobarse',
      description: 'Solo los miembros activos pueden consultar el acceso y las instrucciones del grupo.',
    },
  ];

  protected readonly activeIndex = signal(0);
  protected readonly activeStage = computed(() => this.stages[this.activeIndex()]);

  protected selectStage(index: number): void {
    this.activeIndex.set(index);
    this.analytics.track('landing_payment_stage_viewed', { stage: this.stages[index].label, index: index + 1 });
  }

  protected nextStage(): void {
    const nextIndex = (this.activeIndex() + 1) % this.stages.length;
    this.selectStage(nextIndex);
  }
}
