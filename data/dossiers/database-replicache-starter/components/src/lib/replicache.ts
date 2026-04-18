import { Replicache } from 'replicache';

export type Todo = {
  id: string;
  text: string;
  completed: boolean;
  updatedAt: number;
};

export type TodoUpdate = {
  id: string;
  text?: string;
  completed?: boolean;
};

export type Mutators = {
  createTodo: (tx: Replicache<Mutators>['mutate'], args: {id: string; text: string}) => Promise<void>;
  updateTodo: (tx: Replicache<Mutators>['mutate'], args: TodoUpdate) => Promise<void>;
  deleteTodos: (tx: Replicache<Mutators>['mutate'], args: {ids: string[]}) => Promise<void>;
  completeTodos: (tx: Replicache<Mutators>['mutate'], args: {ids: string[]; completed: boolean}) => Promise<void>;
};

export function createReplicache(opts: {name: string; pushURL?: string; pullURL?: string}) {
  return new Replicache<Mutators>({
    name: opts.name,
    pushURL: opts.pushURL ?? '/api/replicache/push',
    pullURL: opts.pullURL ?? '/api/replicache/pull',
    mutators: {
      async createTodo(tx, {id, text}) {
        const now = Date.now();
        await tx.set(`todo/${id}`, {id, text, completed: false, updatedAt: now});
      },
      async updateTodo(tx, {id, text, completed}) {
        const prev = (await tx.get(`todo/${id}`)) as Todo | undefined;
        if (!prev) return;
        await tx.set(`todo/${id}`, {
          ...prev,
          ...(text !== undefined ? {text} : {}),
          ...(completed !== undefined ? {completed} : {}),
          updatedAt: Date.now(),
        });
      },
      async deleteTodos(tx, {ids}) {
        await Promise.all(ids.map((id) => tx.del(`todo/${id}`)));
      },
      async completeTodos(tx, {ids, completed}) {
        await Promise.all(
          ids.map(async (id) => {
            const prev = (await tx.get(`todo/${id}`)) as Todo | undefined;
            if (!prev) return;
            await tx.set(`todo/${id}`, {...prev, completed, updatedAt: Date.now()});
          })
        );
      },
    },
  });
}
