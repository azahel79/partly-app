import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';

@Component({
  selector: 'app-cycle-guide',
  imports: [RouterLink, RevealDirective],
  templateUrl: './cycle-guide.html',
  styleUrls: ['./cycle-guide.css', './cycle-guide-extra.css'],
})
export class CycleGuide {}
