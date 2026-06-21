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
  }
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
