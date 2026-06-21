import { getRewardPathProgress } from "../src/features/todos/selectors.js";
import { createMember, createReward, createTodo, expectEqual, type TestCase } from "./testUtils.js";

const child = createMember("member-child", { isChild: true });
const reward = createReward({
  id: "reward-bike",
  wishedBy: child.id,
  starsNeeded: 10
});

const tests: TestCase[] = [
  {
    name: "approved todos count as stars",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "approved-1",
          assignedTo: child.id,
          status: "approved",
          starValue: 4
        }),
        createTodo({
          id: "approved-2",
          assignedTo: child.id,
          status: "approved",
          starValue: 3
        })
      ]);

      expectEqual(progress.approvedStars, 7);
      expectEqual(progress.starsLeft, 3);
      expectEqual(progress.isUnlocked, false);
    }
  },
  {
    name: "done todos become pending task images and do not count as stars",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "done-1",
          assignedTo: child.id,
          status: "done",
          starValue: 5
        })
      ]);

      expectEqual(progress.approvedStars, 0);
      expectEqual(progress.pendingTaskImages.length, 1);
      expectEqual(progress.pendingTaskImages[0]?.id, "done-1");
      expectEqual(progress.starsLeft, 10);
    }
  },
  {
    name: "pending rejected and expired todos do not count as stars or pending images",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({ id: "pending", assignedTo: child.id, status: "pending" }),
        createTodo({ id: "rejected", assignedTo: child.id, status: "rejected" }),
        createTodo({ id: "expired", assignedTo: child.id, status: "expired" })
      ]);

      expectEqual(progress.approvedStars, 0);
      expectEqual(progress.pendingTaskImages.length, 0);
      expectEqual(progress.starsLeft, 10);
    }
  },
  {
    name: "rejected todos are included in rejectedTodos for feedback display",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({ id: "rejected-1", assignedTo: child.id, status: "rejected" }),
        createTodo({ id: "rejected-2", assignedTo: child.id, status: "rejected" }),
        createTodo({ id: "approved-1", assignedTo: child.id, status: "approved", starValue: 3 })
      ]);

      expectEqual(progress.rejectedTodos.length, 2);
      expectEqual(progress.rejectedTodos[0]?.id, "rejected-1");
      expectEqual(progress.rejectedTodos[1]?.id, "rejected-2");
      expectEqual(progress.approvedStars, 3);
    }
  },
  {
    name: "deleted rejected todos do not appear in rejectedTodos",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "rejected-deleted",
          assignedTo: child.id,
          status: "rejected",
          deletedAt: "2026-06-21T10:00:00",
          deletedBy: "member-parent"
        }),
        createTodo({ id: "rejected-active", assignedTo: child.id, status: "rejected" })
      ]);

      expectEqual(progress.rejectedTodos.length, 1);
      expectEqual(progress.rejectedTodos[0]?.id, "rejected-active");
    }
  },
  {
    name: "todos assigned to another member do not affect the child reward path",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "other-child-approved",
          assignedTo: "member-other-child",
          status: "approved",
          starValue: 10
        }),
        createTodo({
          id: "own-approved",
          assignedTo: child.id,
          status: "approved",
          starValue: 2
        })
      ]);

      expectEqual(progress.approvedStars, 2);
      expectEqual(progress.starsLeft, 8);
    }
  },
  {
    name: "deleted todos do not affect the reward path",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "deleted-approved",
          assignedTo: child.id,
          status: "approved",
          starValue: 10,
          deletedAt: "2026-06-09T08:00:00",
          deletedBy: "member-parent"
        })
      ]);

      expectEqual(progress.approvedStars, 0);
      expectEqual(progress.pendingTaskImages.length, 0);
      expectEqual(progress.starsLeft, 10);
      expectEqual(progress.isUnlocked, false);
    }
  },
  {
    name: "reward unlocks when approved stars reach the required amount",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "approved-unlock",
          assignedTo: child.id,
          status: "approved",
          starValue: 10
        })
      ]);

      expectEqual(progress.approvedStars, 10);
      expectEqual(progress.starsLeft, 0);
      expectEqual(progress.isUnlocked, true);
    }
  },
  {
    name: "pathItems preserves order based on completedAt",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "done-second",
          assignedTo: child.id,
          status: "done",
          completedAt: "2026-06-21T10:00:00"
        }),
        createTodo({
          id: "approved-first",
          assignedTo: child.id,
          status: "approved",
          starValue: 2,
          completedAt: "2026-06-21T09:00:00"
        })
      ]);

      expectEqual(progress.pathItems.length, 3);
      expectEqual(progress.pathItems[0]?.type, "approved-star");
      expectEqual(progress.pathItems[1]?.type, "approved-star");
      expectEqual(progress.pathItems[2]?.type, "pending-task");
    }
  },
  {
    name: "approved todo with starValue 3 occupies three consecutive path slots",
    run: () => {
      const progress = getRewardPathProgress(child, reward, [
        createTodo({
          id: "approved-multi",
          assignedTo: child.id,
          status: "approved",
          starValue: 3,
          completedAt: "2026-06-21T09:00:00"
        }),
        createTodo({
          id: "pending-after",
          assignedTo: child.id,
          status: "done",
          completedAt: "2026-06-21T10:00:00"
        })
      ]);

      expectEqual(progress.pathItems.length, 4);
      expectEqual(progress.pathItems[0]?.type, "approved-star");
      expectEqual(progress.pathItems[1]?.type, "approved-star");
      expectEqual(progress.pathItems[2]?.type, "approved-star");
      expectEqual(progress.pathItems[3]?.type, "pending-task");
      expectEqual(progress.approvedStars, 3);
    }
  }
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
