import { describe, test, expect } from "vitest";
import { getRewardPathProgress } from "../src/features/todos/selectors";
import { createMember, createReward, createTodo } from "./testUtils";

const child = createMember("member-child", { isChild: true });
const reward = createReward({ id: "reward-bike", wishedBy: child.id, starsNeeded: 10 });

function makeProgress(todos: Parameters<typeof getRewardPathProgress>[2]) {
  return getRewardPathProgress(child, reward, todos);
}

function assertStarCounts(
  todos: Parameters<typeof makeProgress>[0],
  expectedApproved: number,
  expectedLeft: number
) {
  const progress = makeProgress(todos);
  expect(progress.approvedStars).toBe(expectedApproved);
  expect(progress.starsLeft).toBe(expectedLeft);
  return progress;
}

describe("rewardPath", () => {
  test("approved todos count as stars", () => {
    const progress = assertStarCounts(
      [
        createTodo({ id: "approved-1", assignedTo: child.id, status: "approved", starValue: 4 }),
        createTodo({ id: "approved-2", assignedTo: child.id, status: "approved", starValue: 3 })
      ],
      7,
      3
    );
    expect(progress.isUnlocked).toBe(false);
  });

  test("done todos become pending task images and do not count as stars", () => {
    const progress = makeProgress([
      createTodo({ id: "done-1", assignedTo: child.id, status: "done", starValue: 5 })
    ]);
    expect(progress.approvedStars).toBe(0);
    expect(progress.pendingTaskImages.length).toBe(1);
  });

  test("reward unlocks when approved stars reach starsNeeded", () => {
    const progress = assertStarCounts(
      Array.from({ length: 10 }, (_, i) =>
        createTodo({ id: `approved-${i}`, assignedTo: child.id, status: "approved", starValue: 1 })
      ),
      10,
      0
    );
    expect(progress.isUnlocked).toBe(true);
  });

  test("todos for other children are excluded", () => {
    const other = createMember("member-other");
    const progress = makeProgress([
      createTodo({ id: "other-todo", assignedTo: other.id, status: "approved", starValue: 5 })
    ]);
    expect(progress.approvedStars).toBe(0);
  });

  test("deleted todos are excluded", () => {
    const progress = makeProgress([
      createTodo({
        id: "deleted-approved",
        assignedTo: child.id,
        status: "approved",
        starValue: 5,
        deletedAt: "2026-06-09T08:00:00",
        deletedBy: "member-parent"
      })
    ]);
    expect(progress.approvedStars).toBe(0);
  });

  test("rejected todos are tracked separately", () => {
    const progress = makeProgress([
      createTodo({ id: "rejected-1", assignedTo: child.id, status: "rejected", starValue: 3 })
    ]);
    expect(progress.approvedStars).toBe(0);
    expect(progress.rejectedTodos.length).toBe(1);
  });

  test("mix of statuses produces correct path items", () => {
    const progress = makeProgress([
      createTodo({ id: "a1", assignedTo: child.id, status: "approved", starValue: 2 }),
      createTodo({ id: "a2", assignedTo: child.id, status: "approved", starValue: 3 }),
      createTodo({ id: "d1", assignedTo: child.id, status: "done", starValue: 2 })
    ]);
    expect(progress.approvedStars).toBe(5);
    expect(progress.starsLeft).toBe(5);
    expect(progress.pendingTaskImages.length).toBe(1);
  });
});
