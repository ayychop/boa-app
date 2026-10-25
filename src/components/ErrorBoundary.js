import { Component } from 'react';

/**
 * Catches anything below it that fails to draw (or throws in an effect)
 * and renders `fallback({ error, retry })` in its place, so one broken
 * screen never takes the whole app down. `retry` draws the children again.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.warn(`[${this.props.name ?? 'app'}] failed to draw:`, error?.message ?? error);
  }
  retry = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    return this.props.fallback({ error: this.state.error, retry: this.retry });
  }
}
