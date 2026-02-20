import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { AdminComponent } from './admin/admin.component';
import { ChatComponent } from './chat/chat.component';

const routes: Routes = [
  { path: '', component: LandingComponent, title: 'AI Recipe Composer' },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  { path: 'admin', component: AdminComponent, title: 'Admin Panel' },
  { path: 'chat', component: ChatComponent, title: 'Recipe Assistant' },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled',
    anchorScrolling: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
