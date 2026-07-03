import "./TodoCreatorModal.css";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { TodoCreator } from "./TodoCreator";
import type { Member, Role, Todo } from "@shared/types";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  onCreateTodo: (todo: Todo) => void;
  onClose: () => void;
};

export function TodoCreatorModal({ currentMember, members, roles, onCreateTodo, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="todo-creator-overlay" onClick={onClose}>
      <div
        aria-labelledby="todo-creator-title"
        aria-modal="true"
        className="todo-creator-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-creator-modal__hdr">
          <span id="todo-creator-title">Skapa todo</span>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="todo-creator-modal__body">
          <TodoCreator
            currentMember={currentMember}
            members={members}
            roles={roles}
            onCreateTodo={onCreateTodo}
            onSubmitted={onClose}
          />
        </div>
      </div>
    </div>
  );
}
