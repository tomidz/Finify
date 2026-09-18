"use client";

import * as React from "react";

import { StateCard } from "@/components/state-card";

/** Whether two `resetKeys` lists differ in length or in any entry (Object.is). */
export function resetKeysChanged(
  previous: readonly unknown[] = [],
  next: readonly unknown[] = [],
): boolean {
  return (
    previous.length !== next.length ||
    previous.some((key, index) => !Object.is(key, next[index]))
  );
}

export type RenderErrorBoundaryProps = {
  children: React.ReactNode;
  /** Names the block in the console line, e.g. "net-worth-chart". */
  name?: string;
  /** The fallback's title. Defaults to "No se pudo mostrar". */
  title?: string;
  /** Classes for the fallback card, e.g. the block's height. */
  className?: string;
  /**
   * Clears the error when any entry changes, e.g. the data the block renders:
   * new data may render fine where the old crashed.
   */
  resetKeys?: readonly unknown[];
};

type State = { error: unknown; failed: boolean };

/**
 * Keeps a render crash in one block (a chart, a card) from taking down the
 * page: the block shows an error card with a retry that renders it again.
 */
export class RenderErrorBoundary extends React.Component<
  RenderErrorBoundaryProps,
  State
> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(
      `[RenderErrorBoundary] ${this.props.name ?? "block"} crashed while rendering`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(previous: RenderErrorBoundaryProps) {
    if (
      this.state.failed &&
      resetKeysChanged(previous.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null, failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <StateCard
        variant="error"
        title={this.props.title ?? "No se pudo mostrar"}
        error={this.state.error}
        onRetry={this.reset}
        className={this.props.className}
      />
    );
  }
}
