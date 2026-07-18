import { createDefine } from "fresh";

export interface State {
  requestId: string;
}

export const define = createDefine<State>();
