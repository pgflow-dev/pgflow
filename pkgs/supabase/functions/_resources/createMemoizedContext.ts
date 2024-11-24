const Deno = {
  env: {
    GROQ_API_KEY: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
};

const createMemoizedContext = <T extends Record<string, (env: any) => any>>(
  context: T,
) => {
  const cache = new Map<string, any>();

  return Object.entries(context).reduce(
    (acc, [name, factoryFn]) => {
      Object.defineProperty(acc, name, {
        get() {
          if (!cache.has(name)) {
            cache.set(name, factoryFn(Deno.env));
          }
          return cache.get(name);
        },
        enumerable: true,
        configurable: true,
      });
      return acc;
    },
    {} as { [K in keyof T]: ReturnType<T[K]> },
  );
};
