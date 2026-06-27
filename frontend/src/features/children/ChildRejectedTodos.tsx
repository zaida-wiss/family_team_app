import type { Id, Todo } from "@shared/types";

type Props = {
  rejectedTodos: Todo[];
  onDismiss: (id: Id) => void;
};

export function ChildRejectedTodos({ rejectedTodos, onDismiss }: Props) {
  if (rejectedTodos.length === 0) return null;

  return (
    <section className="rejected-notice" aria-label="Nekade uppgifter">
      {rejectedTodos.map((todo) => (
        <div className="rejected-todo-card" key={todo.id}>
          <span>{todo.visual.value}</span>
          <div>
            <strong>{todo.title}</strong>
            <small>Den här gick inte igenom – prova igen!</small>
          </div>
          <button
            className="rejected-dismiss"
            type="button"
            onClick={() => onDismiss(todo.id)}
            aria-label="Stäng"
          >
            Okej
          </button>
        </div>
      ))}
    </section>
  );
}
