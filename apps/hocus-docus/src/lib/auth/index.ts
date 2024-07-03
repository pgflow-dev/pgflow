import { db } from "$lib/db";
import { profileTable } from "$lib/db/schema";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

export const getOrCreateUserProfile = async (locals: App.Locals) => {
  const { user } = await locals.safeGetSession();

  if (!user) {
    return null;
  }

  const curProfile = await db.query.profileTable.findFirst({
    where: eq(profileTable.id, user.id),
  });

  if (curProfile) {
    return curProfile;
  }

  await db.insert(profileTable).values({
    id: user.id,
    firstName: "",
    lastName: "",
    email: user.email ?? "",
  });

  const newProfile = await db.query.profileTable.findFirst({
    where: eq(profileTable.id, user.id),
  });

  if (!newProfile) {
    error(500, "Could not create profile");
  }

  return newProfile;
};
