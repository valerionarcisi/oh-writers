export const getDb = async () => {
  const { db } = await import("@oh-writers/db");
  return db;
};

export type Db = Awaited<ReturnType<typeof getDb>>;
