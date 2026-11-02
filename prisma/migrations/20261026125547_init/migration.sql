-- CreateEnum
CREATE TYPE "role_scope" AS ENUM ('all', 'brand', 'franchise', 'outlet', 'self');

-- CreateEnum
CREATE TYPE "category_type" AS ENUM ('training', 'recipe');

-- CreateEnum
CREATE TYPE "video_source" AS ENUM ('bunny', 'external');

-- CreateEnum
CREATE TYPE "video_state" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "version_state" AS ENUM ('draft', 'published', 'superseded');

-- CreateEnum
CREATE TYPE "update_action" AS ENUM ('none', 'reacknowledge', 'retrain');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('single', 'multiple', 'written');

-- CreateEnum
CREATE TYPE "assignment_state" AS ENUM ('assigned', 'in_progress', 'failed', 'completed', 'revoked');

-- CreateEnum
CREATE TYPE "assignment_source" AS ENUM ('manual', 'group', 'path', 'self', 'retraining');

-- CreateEnum
CREATE TYPE "attempt_state" AS ENUM ('in_progress', 'submitted');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('new_training', 'deadline_reminder', 'overdue', 'retraining', 'account', 'general');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('password_reset');

-- CreateTable
CREATE TABLE "sys_module" (
    "module_id" SERIAL NOT NULL,
    "module_key" VARCHAR(255) NOT NULL,
    "module_name" VARCHAR(255),
    "module_status" BOOLEAN NOT NULL DEFAULT true,
    "module_created_by" VARCHAR(25),
    "module_updated_by" VARCHAR(25),
    "module_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "module_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "module_archived" BOOLEAN NOT NULL DEFAULT false,
    "module_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sys_module_pkey" PRIMARY KEY ("module_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "role_id" SERIAL NOT NULL,
    "role_key" VARCHAR(255) NOT NULL,
    "role_name" VARCHAR(255) NOT NULL,
    "role_description" VARCHAR(255),
    "role_scope" "role_scope" NOT NULL DEFAULT 'self',
    "role_shift_restricted" BOOLEAN NOT NULL DEFAULT true,
    "role_is_system" BOOLEAN NOT NULL DEFAULT false,
    "role_status" BOOLEAN NOT NULL DEFAULT true,
    "role_created_by" VARCHAR(25),
    "role_updated_by" VARCHAR(25),
    "role_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_archived" BOOLEAN NOT NULL DEFAULT false,
    "role_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "module_role_map" (
    "mrm_id" SERIAL NOT NULL,
    "mrm_module_id" INTEGER NOT NULL,
    "mrm_role_id" INTEGER NOT NULL,
    "mrm_read" BOOLEAN NOT NULL DEFAULT false,
    "mrm_write" BOOLEAN NOT NULL DEFAULT false,
    "mrm_status" BOOLEAN NOT NULL DEFAULT true,
    "mrm_created_by" VARCHAR(25),
    "mrm_updated_by" VARCHAR(25),
    "mrm_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mrm_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mrm_archived" BOOLEAN NOT NULL DEFAULT false,
    "mrm_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "module_role_map_pkey" PRIMARY KEY ("mrm_id")
);

-- CreateTable
CREATE TABLE "brands" (
    "brand_id" SERIAL NOT NULL,
    "brand_name" VARCHAR(255) NOT NULL,
    "brand_code" VARCHAR(50) NOT NULL,
    "brand_description" TEXT,
    "brand_status" BOOLEAN NOT NULL DEFAULT true,
    "brand_created_by" VARCHAR(25),
    "brand_updated_by" VARCHAR(25),
    "brand_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brand_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brand_archived" BOOLEAN NOT NULL DEFAULT false,
    "brand_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("brand_id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "outlet_id" SERIAL NOT NULL,
    "outlet_name" VARCHAR(255) NOT NULL,
    "outlet_code" VARCHAR(50) NOT NULL,
    "outlet_brand_id" INTEGER NOT NULL,
    "outlet_city" VARCHAR(100),
    "outlet_address" TEXT,
    "outlet_franchisee_id" INTEGER,
    "outlet_timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "outlet_shift_start" VARCHAR(5),
    "outlet_shift_end" VARCHAR(5),
    "outlet_shift_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "outlet_status" BOOLEAN NOT NULL DEFAULT true,
    "outlet_created_by" VARCHAR(25),
    "outlet_updated_by" VARCHAR(25),
    "outlet_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outlet_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outlet_archived" BOOLEAN NOT NULL DEFAULT false,
    "outlet_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("outlet_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "user_employee_id" VARCHAR(50) NOT NULL,
    "user_first_name" VARCHAR(255) NOT NULL,
    "user_last_name" VARCHAR(255) NOT NULL,
    "user_email" VARCHAR(255),
    "user_mobile" VARCHAR(20) NOT NULL,
    "user_password" VARCHAR(255) NOT NULL,
    "user_role_id" INTEGER NOT NULL,
    "user_brand_id" INTEGER,
    "user_outlet_id" INTEGER,
    "user_designation" VARCHAR(100),
    "user_manager_id" INTEGER,
    "user_joining_date" DATE,
    "user_language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "user_path_id" INTEGER,
    "user_path_deadline" DATE,
    "user_shift_start" VARCHAR(5),
    "user_shift_end" VARCHAR(5),
    "user_shift_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "user_shift_exempt" BOOLEAN NOT NULL DEFAULT false,
    "user_access_expires_at" TIMESTAMP(3),
    "user_must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "user_token_version" INTEGER NOT NULL DEFAULT 0,
    "user_failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "user_locked_until" TIMESTAMP(3),
    "user_last_login_at" TIMESTAMP(3),
    "user_deactivated_at" TIMESTAMP(3),
    "user_deactivation_reason" VARCHAR(255),
    "user_status" BOOLEAN NOT NULL DEFAULT true,
    "user_created_by" VARCHAR(25),
    "user_updated_by" VARCHAR(25),
    "user_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_archived" BOOLEAN NOT NULL DEFAULT false,
    "user_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_transfers" (
    "ut_id" SERIAL NOT NULL,
    "ut_user_id" INTEGER NOT NULL,
    "ut_from_outlet_id" INTEGER,
    "ut_to_outlet_id" INTEGER,
    "ut_note" VARCHAR(255),
    "ut_created_by_id" INTEGER,
    "ut_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_transfers_pkey" PRIMARY KEY ("ut_id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "otp_id" SERIAL NOT NULL,
    "otp_user_id" INTEGER NOT NULL,
    "otp_purpose" "otp_purpose" NOT NULL,
    "otp_code_hash" VARCHAR(255) NOT NULL,
    "otp_expires_at" TIMESTAMP(3) NOT NULL,
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "otp_consumed_at" TIMESTAMP(3),
    "otp_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("otp_id")
);

-- CreateTable
CREATE TABLE "videos" (
    "video_id" SERIAL NOT NULL,
    "video_source" "video_source" NOT NULL DEFAULT 'bunny',
    "video_guid" VARCHAR(64),
    "video_library_id" VARCHAR(32),
    "video_url" TEXT,
    "video_title" VARCHAR(255) NOT NULL,
    "video_state" "video_state" NOT NULL DEFAULT 'uploading',
    "video_duration_seconds" INTEGER,
    "video_status" BOOLEAN NOT NULL DEFAULT true,
    "video_created_by" VARCHAR(25),
    "video_updated_by" VARCHAR(25),
    "video_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "video_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "video_archived" BOOLEAN NOT NULL DEFAULT false,
    "video_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("video_id")
);

-- CreateTable
CREATE TABLE "files" (
    "file_id" SERIAL NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_key" VARCHAR(255) NOT NULL,
    "file_mime" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_status" BOOLEAN NOT NULL DEFAULT true,
    "file_created_by" VARCHAR(25),
    "file_updated_by" VARCHAR(25),
    "file_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_archived" BOOLEAN NOT NULL DEFAULT false,
    "file_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "files_pkey" PRIMARY KEY ("file_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "cat_id" SERIAL NOT NULL,
    "cat_name" VARCHAR(255) NOT NULL,
    "cat_type" "category_type" NOT NULL,
    "cat_sequence" INTEGER NOT NULL DEFAULT 0,
    "cat_status" BOOLEAN NOT NULL DEFAULT true,
    "cat_created_by" VARCHAR(25),
    "cat_updated_by" VARCHAR(25),
    "cat_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cat_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cat_archived" BOOLEAN NOT NULL DEFAULT false,
    "cat_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("cat_id")
);

-- CreateTable
CREATE TABLE "training_modules" (
    "tm_id" SERIAL NOT NULL,
    "tm_code" VARCHAR(50),
    "tm_category_id" INTEGER,
    "tm_language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "tm_brand_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tm_role_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tm_is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "tm_sequence" INTEGER NOT NULL DEFAULT 0,
    "tm_prerequisite_id" INTEGER,
    "tm_due_days" INTEGER NOT NULL DEFAULT 14,
    "tm_current_version_id" INTEGER,
    "tm_status" BOOLEAN NOT NULL DEFAULT true,
    "tm_created_by" VARCHAR(25),
    "tm_updated_by" VARCHAR(25),
    "tm_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tm_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tm_archived" BOOLEAN NOT NULL DEFAULT false,
    "tm_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "training_modules_pkey" PRIMARY KEY ("tm_id")
);

-- CreateTable
CREATE TABLE "module_versions" (
    "mv_id" SERIAL NOT NULL,
    "mv_module_id" INTEGER NOT NULL,
    "mv_version_no" INTEGER NOT NULL,
    "mv_state" "version_state" NOT NULL DEFAULT 'draft',
    "mv_title" VARCHAR(255) NOT NULL,
    "mv_description" TEXT,
    "mv_instructions" TEXT,
    "mv_min_watch_percent" INTEGER NOT NULL DEFAULT 90,
    "mv_pass_mark" INTEGER NOT NULL DEFAULT 70,
    "mv_max_attempts" INTEGER NOT NULL DEFAULT 3,
    "mv_question_limit" INTEGER,
    "mv_randomize_questions" BOOLEAN NOT NULL DEFAULT true,
    "mv_randomize_options" BOOLEAN NOT NULL DEFAULT true,
    "mv_requires_ack" BOOLEAN NOT NULL DEFAULT true,
    "mv_ack_text" TEXT NOT NULL DEFAULT 'I have read and understood this SOP and will follow it.',
    "mv_update_action" "update_action" NOT NULL DEFAULT 'none',
    "mv_change_note" TEXT,
    "mv_published_at" TIMESTAMP(3),
    "mv_published_by_id" INTEGER,
    "mv_created_by" VARCHAR(25),
    "mv_updated_by" VARCHAR(25),
    "mv_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mv_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_versions_pkey" PRIMARY KEY ("mv_id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "lesson_id" SERIAL NOT NULL,
    "lesson_version_id" INTEGER NOT NULL,
    "lesson_title" VARCHAR(255) NOT NULL,
    "lesson_content" TEXT,
    "lesson_video_id" INTEGER,
    "lesson_sequence" INTEGER NOT NULL DEFAULT 0,
    "lesson_is_required" BOOLEAN NOT NULL DEFAULT true,
    "lesson_min_watch_percent" INTEGER,
    "lesson_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lesson_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("lesson_id")
);

-- CreateTable
CREATE TABLE "lesson_files" (
    "lf_id" SERIAL NOT NULL,
    "lf_lesson_id" INTEGER NOT NULL,
    "lf_file_id" INTEGER NOT NULL,
    "lf_sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lesson_files_pkey" PRIMARY KEY ("lf_id")
);

-- CreateTable
CREATE TABLE "questions" (
    "q_id" SERIAL NOT NULL,
    "q_version_id" INTEGER NOT NULL,
    "q_type" "question_type" NOT NULL DEFAULT 'single',
    "q_text" TEXT NOT NULL,
    "q_explanation" TEXT,
    "q_marks" INTEGER NOT NULL DEFAULT 1,
    "q_sequence" INTEGER NOT NULL DEFAULT 0,
    "q_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "q_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("q_id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "qo_id" SERIAL NOT NULL,
    "qo_question_id" INTEGER NOT NULL,
    "qo_text" TEXT NOT NULL,
    "qo_is_correct" BOOLEAN NOT NULL DEFAULT false,
    "qo_sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("qo_id")
);

-- CreateTable
CREATE TABLE "training_paths" (
    "tp_id" SERIAL NOT NULL,
    "tp_name" VARCHAR(255) NOT NULL,
    "tp_description" TEXT,
    "tp_role_id" INTEGER,
    "tp_brand_id" INTEGER,
    "tp_status" BOOLEAN NOT NULL DEFAULT true,
    "tp_created_by" VARCHAR(25),
    "tp_updated_by" VARCHAR(25),
    "tp_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tp_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tp_archived" BOOLEAN NOT NULL DEFAULT false,
    "tp_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "training_paths_pkey" PRIMARY KEY ("tp_id")
);

-- CreateTable
CREATE TABLE "training_path_modules" (
    "tpm_id" SERIAL NOT NULL,
    "tpm_path_id" INTEGER NOT NULL,
    "tpm_module_id" INTEGER NOT NULL,
    "tpm_sequence" INTEGER NOT NULL DEFAULT 0,
    "tpm_due_days" INTEGER,

    CONSTRAINT "training_path_modules_pkey" PRIMARY KEY ("tpm_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "asg_id" SERIAL NOT NULL,
    "asg_user_id" INTEGER NOT NULL,
    "asg_module_id" INTEGER NOT NULL,
    "asg_version_id" INTEGER NOT NULL,
    "asg_state" "assignment_state" NOT NULL DEFAULT 'assigned',
    "asg_source" "assignment_source" NOT NULL DEFAULT 'manual',
    "asg_is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "asg_ack_only" BOOLEAN NOT NULL DEFAULT false,
    "asg_due_at" TIMESTAMP(3),
    "asg_assigned_by_id" INTEGER,
    "asg_previous_id" INTEGER,
    "asg_started_at" TIMESTAMP(3),
    "asg_lessons_completed_at" TIMESTAMP(3),
    "asg_assessment_passed_at" TIMESTAMP(3),
    "asg_acknowledged_at" TIMESTAMP(3),
    "asg_completed_at" TIMESTAMP(3),
    "asg_best_score" INTEGER,
    "asg_attempts_used" INTEGER NOT NULL DEFAULT 0,
    "asg_last_reminder_at" TIMESTAMP(3),
    "asg_overdue_notified_at" TIMESTAMP(3),
    "asg_revoked_at" TIMESTAMP(3),
    "asg_revoke_reason" VARCHAR(255),
    "asg_status" BOOLEAN NOT NULL DEFAULT true,
    "asg_created_by" VARCHAR(25),
    "asg_updated_by" VARCHAR(25),
    "asg_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asg_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asg_archived" BOOLEAN NOT NULL DEFAULT false,
    "asg_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("asg_id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "lp_id" SERIAL NOT NULL,
    "lp_assignment_id" INTEGER NOT NULL,
    "lp_lesson_id" INTEGER NOT NULL,
    "lp_user_id" INTEGER NOT NULL,
    "lp_position_seconds" INTEGER NOT NULL DEFAULT 0,
    "lp_max_position" INTEGER NOT NULL DEFAULT 0,
    "lp_watched_seconds" INTEGER NOT NULL DEFAULT 0,
    "lp_duration_seconds" INTEGER,
    "lp_watched_percent" INTEGER NOT NULL DEFAULT 0,
    "lp_last_heartbeat_at" TIMESTAMP(3),
    "lp_completed_at" TIMESTAMP(3),
    "lp_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lp_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("lp_id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "aa_id" SERIAL NOT NULL,
    "aa_assignment_id" INTEGER NOT NULL,
    "aa_user_id" INTEGER NOT NULL,
    "aa_version_id" INTEGER NOT NULL,
    "aa_attempt_no" INTEGER NOT NULL,
    "aa_state" "attempt_state" NOT NULL DEFAULT 'in_progress',
    "aa_question_ids" INTEGER[],
    "aa_option_order" JSONB,
    "aa_marks_obtained" INTEGER,
    "aa_marks_total" INTEGER,
    "aa_score" INTEGER,
    "aa_passed" BOOLEAN,
    "aa_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aa_submitted_at" TIMESTAMP(3),

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("aa_id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "ans_id" SERIAL NOT NULL,
    "ans_attempt_id" INTEGER NOT NULL,
    "ans_question_id" INTEGER NOT NULL,
    "ans_option_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "ans_text" TEXT,
    "ans_is_correct" BOOLEAN,
    "ans_marks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("ans_id")
);

-- CreateTable
CREATE TABLE "acknowledgements" (
    "ack_id" SERIAL NOT NULL,
    "ack_assignment_id" INTEGER NOT NULL,
    "ack_user_id" INTEGER NOT NULL,
    "ack_version_id" INTEGER NOT NULL,
    "ack_text" TEXT NOT NULL,
    "ack_ip" VARCHAR(64),
    "ack_user_agent" VARCHAR(255),
    "ack_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acknowledgements_pkey" PRIMARY KEY ("ack_id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "recipe_id" SERIAL NOT NULL,
    "recipe_name" VARCHAR(255) NOT NULL,
    "recipe_code" VARCHAR(50),
    "recipe_brand_id" INTEGER,
    "recipe_category_id" INTEGER,
    "recipe_role_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "recipe_description" TEXT,
    "recipe_video_id" INTEGER,
    "recipe_portion_size" VARCHAR(100),
    "recipe_yield" VARCHAR(100),
    "recipe_prep_time_minutes" INTEGER,
    "recipe_cook_time_minutes" INTEGER,
    "recipe_equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipe_cooking_instructions" TEXT,
    "recipe_plating_instructions" TEXT,
    "recipe_plating_image_id" INTEGER,
    "recipe_storage_instructions" TEXT,
    "recipe_shelf_life" VARCHAR(100),
    "recipe_food_safety" TEXT,
    "recipe_common_mistakes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipe_quality_checkpoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipe_is_published" BOOLEAN NOT NULL DEFAULT false,
    "recipe_published_at" TIMESTAMP(3),
    "recipe_revision" INTEGER NOT NULL DEFAULT 0,
    "recipe_status" BOOLEAN NOT NULL DEFAULT true,
    "recipe_created_by" VARCHAR(25),
    "recipe_updated_by" VARCHAR(25),
    "recipe_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipe_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipe_archived" BOOLEAN NOT NULL DEFAULT false,
    "recipe_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("recipe_id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "ri_id" SERIAL NOT NULL,
    "ri_recipe_id" INTEGER NOT NULL,
    "ri_name" VARCHAR(255) NOT NULL,
    "ri_quantity" DECIMAL(10,3),
    "ri_unit" VARCHAR(30),
    "ri_note" VARCHAR(255),
    "ri_sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("ri_id")
);

-- CreateTable
CREATE TABLE "recipe_steps" (
    "rs_id" SERIAL NOT NULL,
    "rs_recipe_id" INTEGER NOT NULL,
    "rs_sequence" INTEGER NOT NULL DEFAULT 0,
    "rs_instruction" TEXT NOT NULL,
    "rs_duration_minutes" INTEGER,
    "rs_image_id" INTEGER,

    CONSTRAINT "recipe_steps_pkey" PRIMARY KEY ("rs_id")
);

-- CreateTable
CREATE TABLE "recipe_revisions" (
    "rr_id" SERIAL NOT NULL,
    "rr_recipe_id" INTEGER NOT NULL,
    "rr_revision" INTEGER NOT NULL,
    "rr_snapshot" JSONB NOT NULL,
    "rr_note" VARCHAR(255),
    "rr_created_by" VARCHAR(25),
    "rr_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_revisions_pkey" PRIMARY KEY ("rr_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "ntf_id" SERIAL NOT NULL,
    "ntf_user_id" INTEGER NOT NULL,
    "ntf_type" "notification_type" NOT NULL,
    "ntf_title" VARCHAR(255) NOT NULL,
    "ntf_message" TEXT NOT NULL,
    "ntf_link" VARCHAR(255),
    "ntf_assignment_id" INTEGER,
    "ntf_read_at" TIMESTAMP(3),
    "ntf_emailed_at" TIMESTAMP(3),
    "ntf_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("ntf_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "al_id" SERIAL NOT NULL,
    "al_user_id" INTEGER,
    "al_action" VARCHAR(100) NOT NULL,
    "al_entity" VARCHAR(50) NOT NULL,
    "al_entity_id" INTEGER,
    "al_meta" JSONB,
    "al_ip" VARCHAR(64),
    "al_user_agent" VARCHAR(255),
    "al_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("al_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_module_module_key_key" ON "sys_module"("module_key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_key_key" ON "roles"("role_key");

-- CreateIndex
CREATE INDEX "role_status_index" ON "roles"("role_status");

-- CreateIndex
CREATE INDEX "mrm_role_module_index" ON "module_role_map"("mrm_role_id", "mrm_module_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_brand_code_key" ON "brands"("brand_code");

-- CreateIndex
CREATE INDEX "brand_status_index" ON "brands"("brand_status");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_outlet_code_key" ON "outlets"("outlet_code");

-- CreateIndex
CREATE INDEX "outlet_status_index" ON "outlets"("outlet_status");

-- CreateIndex
CREATE INDEX "outlet_brand_index" ON "outlets"("outlet_brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_employee_id_key" ON "users"("user_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_email_key" ON "users"("user_email");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_mobile_key" ON "users"("user_mobile");

-- CreateIndex
CREATE INDEX "user_status_index" ON "users"("user_status");

-- CreateIndex
CREATE INDEX "user_outlet_index" ON "users"("user_outlet_id");

-- CreateIndex
CREATE INDEX "user_brand_index" ON "users"("user_brand_id");

-- CreateIndex
CREATE INDEX "user_role_index" ON "users"("user_role_id");

-- CreateIndex
CREATE INDEX "ut_user_index" ON "user_transfers"("ut_user_id");

-- CreateIndex
CREATE INDEX "otp_user_purpose_index" ON "otp_codes"("otp_user_id", "otp_purpose");

-- CreateIndex
CREATE UNIQUE INDEX "videos_video_guid_key" ON "videos"("video_guid");

-- CreateIndex
CREATE INDEX "video_status_index" ON "videos"("video_status");

-- CreateIndex
CREATE UNIQUE INDEX "files_file_key_key" ON "files"("file_key");

-- CreateIndex
CREATE INDEX "file_status_index" ON "files"("file_status");

-- CreateIndex
CREATE INDEX "cat_status_type_index" ON "categories"("cat_status", "cat_type");

-- CreateIndex
CREATE UNIQUE INDEX "training_modules_tm_code_key" ON "training_modules"("tm_code");

-- CreateIndex
CREATE UNIQUE INDEX "training_modules_tm_current_version_id_key" ON "training_modules"("tm_current_version_id");

-- CreateIndex
CREATE INDEX "tm_status_index" ON "training_modules"("tm_status");

-- CreateIndex
CREATE UNIQUE INDEX "mv_module_version_unique" ON "module_versions"("mv_module_id", "mv_version_no");

-- CreateIndex
CREATE INDEX "lesson_version_index" ON "lessons"("lesson_version_id");

-- CreateIndex
CREATE INDEX "lf_lesson_index" ON "lesson_files"("lf_lesson_id");

-- CreateIndex
CREATE INDEX "q_version_index" ON "questions"("q_version_id");

-- CreateIndex
CREATE INDEX "qo_question_index" ON "question_options"("qo_question_id");

-- CreateIndex
CREATE INDEX "tp_status_index" ON "training_paths"("tp_status");

-- CreateIndex
CREATE UNIQUE INDEX "tpm_path_module_unique" ON "training_path_modules"("tpm_path_id", "tpm_module_id");

-- CreateIndex
CREATE INDEX "asg_user_module_index" ON "assignments"("asg_user_id", "asg_module_id");

-- CreateIndex
CREATE INDEX "asg_state_index" ON "assignments"("asg_state");

-- CreateIndex
CREATE INDEX "asg_due_index" ON "assignments"("asg_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "lp_assignment_lesson_unique" ON "lesson_progress"("lp_assignment_id", "lp_lesson_id");

-- CreateIndex
CREATE INDEX "aa_assignment_index" ON "assessment_attempts"("aa_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "ans_attempt_question_unique" ON "attempt_answers"("ans_attempt_id", "ans_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "acknowledgements_ack_assignment_id_key" ON "acknowledgements"("ack_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_recipe_code_key" ON "recipes"("recipe_code");

-- CreateIndex
CREATE INDEX "recipe_status_index" ON "recipes"("recipe_status");

-- CreateIndex
CREATE INDEX "recipe_brand_index" ON "recipes"("recipe_brand_id");

-- CreateIndex
CREATE INDEX "ri_recipe_index" ON "recipe_ingredients"("ri_recipe_id");

-- CreateIndex
CREATE INDEX "rs_recipe_index" ON "recipe_steps"("rs_recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "rr_recipe_revision_unique" ON "recipe_revisions"("rr_recipe_id", "rr_revision");

-- CreateIndex
CREATE INDEX "ntf_user_read_index" ON "notifications"("ntf_user_id", "ntf_read_at");

-- CreateIndex
CREATE INDEX "al_entity_index" ON "audit_logs"("al_entity", "al_entity_id");

-- CreateIndex
CREATE INDEX "al_user_index" ON "audit_logs"("al_user_id");

-- CreateIndex
CREATE INDEX "al_created_index" ON "audit_logs"("al_created_at");

-- AddForeignKey
ALTER TABLE "module_role_map" ADD CONSTRAINT "module_role_map_mrm_module_id_fkey" FOREIGN KEY ("mrm_module_id") REFERENCES "sys_module"("module_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_role_map" ADD CONSTRAINT "module_role_map_mrm_role_id_fkey" FOREIGN KEY ("mrm_role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_outlet_brand_id_fkey" FOREIGN KEY ("outlet_brand_id") REFERENCES "brands"("brand_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_outlet_franchisee_id_fkey" FOREIGN KEY ("outlet_franchisee_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_role_id_fkey" FOREIGN KEY ("user_role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_brand_id_fkey" FOREIGN KEY ("user_brand_id") REFERENCES "brands"("brand_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_outlet_id_fkey" FOREIGN KEY ("user_outlet_id") REFERENCES "outlets"("outlet_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_manager_id_fkey" FOREIGN KEY ("user_manager_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_path_id_fkey" FOREIGN KEY ("user_path_id") REFERENCES "training_paths"("tp_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transfers" ADD CONSTRAINT "user_transfers_ut_user_id_fkey" FOREIGN KEY ("ut_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transfers" ADD CONSTRAINT "user_transfers_ut_from_outlet_id_fkey" FOREIGN KEY ("ut_from_outlet_id") REFERENCES "outlets"("outlet_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transfers" ADD CONSTRAINT "user_transfers_ut_to_outlet_id_fkey" FOREIGN KEY ("ut_to_outlet_id") REFERENCES "outlets"("outlet_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transfers" ADD CONSTRAINT "user_transfers_ut_created_by_id_fkey" FOREIGN KEY ("ut_created_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_otp_user_id_fkey" FOREIGN KEY ("otp_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_tm_category_id_fkey" FOREIGN KEY ("tm_category_id") REFERENCES "categories"("cat_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_tm_prerequisite_id_fkey" FOREIGN KEY ("tm_prerequisite_id") REFERENCES "training_modules"("tm_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_tm_current_version_id_fkey" FOREIGN KEY ("tm_current_version_id") REFERENCES "module_versions"("mv_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_versions" ADD CONSTRAINT "module_versions_mv_module_id_fkey" FOREIGN KEY ("mv_module_id") REFERENCES "training_modules"("tm_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_versions" ADD CONSTRAINT "module_versions_mv_published_by_id_fkey" FOREIGN KEY ("mv_published_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_lesson_version_id_fkey" FOREIGN KEY ("lesson_version_id") REFERENCES "module_versions"("mv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_lesson_video_id_fkey" FOREIGN KEY ("lesson_video_id") REFERENCES "videos"("video_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_lf_lesson_id_fkey" FOREIGN KEY ("lf_lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_lf_file_id_fkey" FOREIGN KEY ("lf_file_id") REFERENCES "files"("file_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_q_version_id_fkey" FOREIGN KEY ("q_version_id") REFERENCES "module_versions"("mv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_qo_question_id_fkey" FOREIGN KEY ("qo_question_id") REFERENCES "questions"("q_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_paths" ADD CONSTRAINT "training_paths_tp_role_id_fkey" FOREIGN KEY ("tp_role_id") REFERENCES "roles"("role_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_paths" ADD CONSTRAINT "training_paths_tp_brand_id_fkey" FOREIGN KEY ("tp_brand_id") REFERENCES "brands"("brand_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_path_modules" ADD CONSTRAINT "training_path_modules_tpm_path_id_fkey" FOREIGN KEY ("tpm_path_id") REFERENCES "training_paths"("tp_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_path_modules" ADD CONSTRAINT "training_path_modules_tpm_module_id_fkey" FOREIGN KEY ("tpm_module_id") REFERENCES "training_modules"("tm_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asg_user_id_fkey" FOREIGN KEY ("asg_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asg_module_id_fkey" FOREIGN KEY ("asg_module_id") REFERENCES "training_modules"("tm_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asg_version_id_fkey" FOREIGN KEY ("asg_version_id") REFERENCES "module_versions"("mv_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asg_assigned_by_id_fkey" FOREIGN KEY ("asg_assigned_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asg_previous_id_fkey" FOREIGN KEY ("asg_previous_id") REFERENCES "assignments"("asg_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lp_assignment_id_fkey" FOREIGN KEY ("lp_assignment_id") REFERENCES "assignments"("asg_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lp_lesson_id_fkey" FOREIGN KEY ("lp_lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lp_user_id_fkey" FOREIGN KEY ("lp_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_aa_assignment_id_fkey" FOREIGN KEY ("aa_assignment_id") REFERENCES "assignments"("asg_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_aa_user_id_fkey" FOREIGN KEY ("aa_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_aa_version_id_fkey" FOREIGN KEY ("aa_version_id") REFERENCES "module_versions"("mv_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_ans_attempt_id_fkey" FOREIGN KEY ("ans_attempt_id") REFERENCES "assessment_attempts"("aa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_ans_question_id_fkey" FOREIGN KEY ("ans_question_id") REFERENCES "questions"("q_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_ack_assignment_id_fkey" FOREIGN KEY ("ack_assignment_id") REFERENCES "assignments"("asg_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_ack_user_id_fkey" FOREIGN KEY ("ack_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_ack_version_id_fkey" FOREIGN KEY ("ack_version_id") REFERENCES "module_versions"("mv_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_recipe_brand_id_fkey" FOREIGN KEY ("recipe_brand_id") REFERENCES "brands"("brand_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_recipe_category_id_fkey" FOREIGN KEY ("recipe_category_id") REFERENCES "categories"("cat_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_recipe_video_id_fkey" FOREIGN KEY ("recipe_video_id") REFERENCES "videos"("video_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_recipe_plating_image_id_fkey" FOREIGN KEY ("recipe_plating_image_id") REFERENCES "files"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ri_recipe_id_fkey" FOREIGN KEY ("ri_recipe_id") REFERENCES "recipes"("recipe_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_rs_recipe_id_fkey" FOREIGN KEY ("rs_recipe_id") REFERENCES "recipes"("recipe_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_rs_image_id_fkey" FOREIGN KEY ("rs_image_id") REFERENCES "files"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_revisions" ADD CONSTRAINT "recipe_revisions_rr_recipe_id_fkey" FOREIGN KEY ("rr_recipe_id") REFERENCES "recipes"("recipe_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ntf_user_id_fkey" FOREIGN KEY ("ntf_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ntf_assignment_id_fkey" FOREIGN KEY ("ntf_assignment_id") REFERENCES "assignments"("asg_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_al_user_id_fkey" FOREIGN KEY ("al_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
