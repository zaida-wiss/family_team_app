import "./ErrorBoundary.css";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

// React kräver en klasskomponent för felgränser — det finns ingen hook-motsvarighet.
// Fångar krascher i en delvy (t.ex. en panel) så att resten av appen inte rivs ner
// (se produktionsincidenten 2026-07-03: ett okrocherat fel i en enda komponent tog
// ner hela Inställningar-panelen).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary fångade ett fel:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <p className="error-boundary__title">Något gick fel</p>
          <p className="error-boundary__message">Den här delen kunde inte visas. Ladda om sidan för att försöka igen.</p>
          <button
            type="button"
            className="error-boundary__reload"
            onClick={() => window.location.reload()}
          >
            Ladda om
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
