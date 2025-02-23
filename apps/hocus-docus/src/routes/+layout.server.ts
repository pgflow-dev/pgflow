import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals: { session } }) => {
  return {
    session,
  };
};
