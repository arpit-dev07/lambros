import { Component } from '@angular/core';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent {
  scrollTo(event: Event, id: string): void {
    event.preventDefault();
    const element = document.getElementById(id);
    if (!element) return;

    const container = document.querySelector<HTMLElement>('.lp');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = element.getBoundingClientRect();
      const navHeight = Number.parseFloat(getComputedStyle(container).getPropertyValue('--lp-nav-height')) || 68;
      const gutter = 18;
      const top = container.scrollTop + (targetRect.top - containerRect.top) - navHeight - gutter;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
