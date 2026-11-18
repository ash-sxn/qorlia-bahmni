import { ComponentType, LazyExoticComponent } from 'react';

export interface RouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType>;
  name: string;
  /** false: the page draws its own header (left out of the Qorlia shell). */
  shell?: boolean;
}

export type Routes = RouteConfig[];
