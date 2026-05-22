declare module "react-dom" {
  import { ReactNode, ReactPortal } from "react";

  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
