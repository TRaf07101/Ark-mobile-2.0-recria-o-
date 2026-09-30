import { Component, type ReactNode } from "react";

/**
 * Error boundary: if one piece of UI throws while rendering (inventory, HUD, panels), only that piece
 * is dropped instead of React unmounting the whole app — which used to leave a black screen.
 */
export class Guard extends Component<{ children: ReactNode; onError?: (e: unknown) => void; name?: string }, { failed: number }> {
  state = { failed: 0 };
  static getDerivedStateFromError() { return { failed: Date.now() }; }
  componentDidCatch(e: unknown) {
    console.error("UI error in " + (this.props.name ?? "component"), e);
    this.props.onError?.(e);
    // try again on the next tick so the rest of the UI comes back (the failing part only remounts if it recovers)
    setTimeout(() => this.setState({ failed: 0 }), 50);
  }
  render() { return this.state.failed ? null : this.props.children; }
}
