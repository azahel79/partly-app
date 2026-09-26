-- CreateTable
CREATE TABLE "group_profiles" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "assigned_membership_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_profiles_assigned_membership_id_key" ON "group_profiles"("assigned_membership_id");

-- CreateIndex
CREATE INDEX "group_profiles_group_id_idx" ON "group_profiles"("group_id");

-- AddForeignKey
ALTER TABLE "group_profiles" ADD CONSTRAINT "group_profiles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_profiles" ADD CONSTRAINT "group_profiles_assigned_membership_id_fkey" FOREIGN KEY ("assigned_membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
