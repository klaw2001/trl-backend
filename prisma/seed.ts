// Seeds roles, permissions and the super admin. Run with `-- --demo` to add demo brands, outlets,
// users, training and recipes for development.
import { config } from 'dotenv'
import crypto from 'crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'
import {
    assignment_source,
    category_type,
    question_type,
    role_scope,
    version_state,
    video_source,
    video_state
} from '../src/generated/prisma/enums'

config({ quiet: true })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const SEEDER = 'seed'

// Same format as CryptoClient.hashPassword
function hashPassword(plainText: string) {
    const salt = crypto.randomBytes(16).toString('hex')
    const derived = crypto.scryptSync(plainText, salt, 64, { N: 16384 }).toString('hex')

    return `scrypt$16384$${salt}$${derived}`
}

function requireEnv(name: string) {
    const value = process.env[name]

    if (!value || value.startsWith('change-me')) {
        throw new Error(`Set ${name} in .env before seeding`)
    }

    return value
}

const modules = [
    { module_key: 'user', module_name: 'Users' },
    { module_key: 'role', module_name: 'Roles & Permissions' },
    { module_key: 'brand', module_name: 'Brands' },
    { module_key: 'outlet', module_name: 'Outlets' },
    { module_key: 'category', module_name: 'Categories' },
    { module_key: 'training', module_name: 'Training Content' },
    { module_key: 'path', module_name: 'Training Paths' },
    { module_key: 'assignment', module_name: 'Assignments' },
    { module_key: 'recipe', module_name: 'Recipes' },
    { module_key: 'report', module_name: 'Reports' },
    { module_key: 'audit', module_name: 'Audit Logs' }
]

const roles = [
    {
        role_key: 'super_admin',
        role_name: 'Super Admin',
        role_description: 'Company management with full access',
        role_scope: role_scope.all,
        role_shift_restricted: false
    },
    {
        role_key: 'training_admin',
        role_name: 'Training Admin',
        role_description: 'Creates training content, assigns training and reviews results',
        role_scope: role_scope.all,
        role_shift_restricted: false
    },
    {
        role_key: 'outlet_incharge',
        role_name: 'Outlet In-charge',
        role_description: 'Completes in-charge training and monitors outlet staff progress',
        role_scope: role_scope.outlet,
        role_shift_restricted: true
    },
    {
        role_key: 'franchisee',
        role_name: 'Franchisee',
        role_description: 'Completes franchisee training and views progress of own outlets',
        role_scope: role_scope.franchise,
        role_shift_restricted: false
    },
    {
        role_key: 'team_member',
        role_name: 'Team Member',
        role_description: 'Completes assigned training and uses the recipe library',
        role_scope: role_scope.self,
        role_shift_restricted: true
    }
]

// role_key -> module_key -> [read, write]
const permissions: Record<string, Record<string, [boolean, boolean]>> = {
    super_admin: Object.fromEntries(modules.map((m) => [m.module_key, [true, true]])),
    training_admin: {
        user: [true, false],
        brand: [true, false],
        outlet: [true, false],
        category: [true, true],
        training: [true, true],
        path: [true, true],
        assignment: [true, true],
        recipe: [true, true],
        report: [true, false]
    },
    outlet_incharge: {
        user: [true, false],
        report: [true, false]
    },
    franchisee: {
        user: [true, false],
        outlet: [true, false],
        report: [true, false]
    },
    team_member: {}
}

async function seedAccessControl() {
    for (const module of modules) {
        await prisma.sys_module.upsert({
            where: { module_key: module.module_key },
            create: { ...module, module_created_by: SEEDER },
            update: { module_name: module.module_name }
        })
    }

    for (const role of roles) {
        await prisma.roles.upsert({
            where: { role_key: role.role_key },
            create: { ...role, role_is_system: true, role_created_by: SEEDER },
            update: { role_is_system: true }
        })
    }

    const moduleRows = await prisma.sys_module.findMany()
    const roleRows = await prisma.roles.findMany()

    for (const role of roleRows) {
        const rolePermissions = permissions[role.role_key]

        // Only seed defaults once; afterwards permissions are managed from the admin panel
        if (!rolePermissions || (await prisma.module_role_map.count({ where: { mrm_role_id: role.role_id } }))) {
            continue
        }

        await prisma.module_role_map.createMany({
            data: Object.entries(rolePermissions).map(([module_key, [read, write]]) => ({
                mrm_role_id: role.role_id,
                mrm_module_id: moduleRows.find((m) => m.module_key === module_key)!.module_id,
                mrm_read: read || write,
                mrm_write: write,
                mrm_created_by: SEEDER
            }))
        })
    }
}

async function seedSuperAdmin() {
    const role = await prisma.roles.findUniqueOrThrow({ where: { role_key: 'super_admin' } })

    await prisma.users.upsert({
        where: { user_employee_id: 'ADMIN001' },
        create: {
            user_employee_id: 'ADMIN001',
            user_first_name: 'Super',
            user_last_name: 'Admin',
            user_email: 'admin@indoventura.local',
            user_mobile: '919800000001',
            user_password: hashPassword(requireEnv('SEED_ADMIN_PASSWORD')),
            user_must_change_password: true,
            user_role_id: role.role_id,
            user_created_by: SEEDER
        },
        update: {}
    })
}

async function seedCategories() {
    const categories = [
        { cat_name: 'Food Safety', cat_type: category_type.training },
        { cat_name: 'Customer Service', cat_type: category_type.training },
        { cat_name: 'Operations', cat_type: category_type.training },
        { cat_name: 'Beverages', cat_type: category_type.recipe },
        { cat_name: 'Mains', cat_type: category_type.recipe },
        { cat_name: 'Desserts', cat_type: category_type.recipe }
    ]

    for (const [index, category] of categories.entries()) {
        const exists = await prisma.categories.findFirst({ where: category })

        if (!exists) {
            await prisma.categories.create({ data: { ...category, cat_sequence: index, cat_created_by: SEEDER } })
        }
    }
}

async function seedDemo() {
    if (await prisma.brands.findUnique({ where: { brand_code: 'DEMO1' } })) {
        console.log('Demo data already present, skipped')
        return
    }

    const password = hashPassword(requireEnv('SEED_DEMO_PASSWORD'))
    const role = async (role_key: string) => (await prisma.roles.findUniqueOrThrow({ where: { role_key } })).role_id
    const category = async (cat_name: string) =>
        (await prisma.categories.findFirstOrThrow({ where: { cat_name } })).cat_id

    const brandOne = await prisma.brands.create({
        data: { brand_name: 'Demo Brand One', brand_code: 'DEMO1', brand_created_by: SEEDER }
    })
    const brandTwo = await prisma.brands.create({
        data: { brand_name: 'Demo Brand Two', brand_code: 'DEMO2', brand_created_by: SEEDER }
    })

    const outletShift = { outlet_shift_start: '08:00', outlet_shift_end: '23:00', outlet_created_by: SEEDER }

    const andheri = await prisma.outlets.create({
        data: {
            outlet_name: 'Andheri West',
            outlet_code: 'DEMO1-AND',
            outlet_city: 'Mumbai',
            outlet_brand_id: brandOne.brand_id,
            ...outletShift
        }
    })
    const bandra = await prisma.outlets.create({
        data: {
            outlet_name: 'Bandra',
            outlet_code: 'DEMO1-BAN',
            outlet_city: 'Mumbai',
            outlet_brand_id: brandOne.brand_id,
            ...outletShift
        }
    })
    const pune = await prisma.outlets.create({
        data: {
            outlet_name: 'Koregaon Park',
            outlet_code: 'DEMO2-PUN',
            outlet_city: 'Pune',
            outlet_brand_id: brandTwo.brand_id,
            ...outletShift
        }
    })

    const user = (
        employee_id: string,
        first: string,
        last: string,
        mobile: string,
        role_id: number,
        extra: object = {}
    ) =>
        prisma.users.create({
            data: {
                user_employee_id: employee_id,
                user_first_name: first,
                user_last_name: last,
                user_mobile: mobile,
                user_email: `${employee_id.toLowerCase()}@indoventura.local`,
                user_password: password,
                user_must_change_password: false,
                user_role_id: role_id,
                user_joining_date: new Date(),
                user_created_by: SEEDER,
                ...extra
            }
        })

    await user('TRN001', 'Tara', 'Mehta', '919800000002', await role('training_admin'))

    const franchisee = await user('FRN001', 'Farhan', 'Shaikh', '919800000003', await role('franchisee'), {
        user_brand_id: brandOne.brand_id
    })
    await prisma.outlets.updateMany({
        where: { outlet_id: { in: [andheri.outlet_id, bandra.outlet_id] } },
        data: { outlet_franchisee_id: franchisee.user_id }
    })

    const incharge = await user('INC001', 'Isha', 'Kulkarni', '919800000004', await role('outlet_incharge'), {
        user_brand_id: brandOne.brand_id,
        user_outlet_id: andheri.outlet_id,
        user_designation: 'Outlet Manager'
    })

    const teamMemberRole = await role('team_member')
    const crew = {
        user_brand_id: brandOne.brand_id,
        user_outlet_id: andheri.outlet_id,
        user_manager_id: incharge.user_id
    }

    const ravi = await user('TM001', 'Ravi', 'Patil', '919800000005', teamMemberRole, {
        ...crew,
        user_designation: 'Barista'
    })
    const neha = await user('TM002', 'Neha', 'Joshi', '919800000006', teamMemberRole, {
        ...crew,
        user_designation: 'Cashier'
    })
    const arjun = await user('TM003', 'Arjun', 'Rao', '919800000007', teamMemberRole, {
        user_brand_id: brandTwo.brand_id,
        user_outlet_id: pune.outlet_id,
        user_designation: 'Line Cook'
    })
    await user('TM004', 'Sana', 'Khan', '919800000008', teamMemberRole, {
        user_brand_id: brandOne.brand_id,
        user_outlet_id: bandra.outlet_id,
        user_designation: 'Server'
    })

    // Unprotected public test stream so playback works before Bunny is configured
    const demoVideo = await prisma.videos.create({
        data: {
            video_source: video_source.external,
            video_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            video_title: 'Demo video (public test stream)',
            video_state: video_state.ready,
            video_created_by: SEEDER
        }
    })

    const foodSafety = await prisma.training_modules.create({
        data: {
            tm_code: 'FS-101',
            tm_category_id: await category('Food Safety'),
            tm_role_ids: [teamMemberRole, await role('outlet_incharge')],
            tm_due_days: 7,
            tm_sequence: 1,
            tm_created_by: SEEDER,
            versions: {
                create: {
                    mv_version_no: 1,
                    mv_state: version_state.published,
                    mv_published_at: new Date(),
                    mv_title: 'Food Safety Basics',
                    mv_description: 'Personal hygiene, handwashing and safe food handling for every shift.',
                    mv_instructions:
                        'Wash hands for 20 seconds before every shift, after breaks and after handling raw food.',
                    mv_pass_mark: 70,
                    mv_max_attempts: 3,
                    mv_created_by: SEEDER,
                    lessons: {
                        create: [
                            {
                                lesson_title: 'Hygiene on the floor',
                                lesson_content: '<p>Watch the video, then read the handwashing SOP.</p>',
                                lesson_video_id: demoVideo.video_id,
                                lesson_sequence: 0
                            },
                            {
                                lesson_title: 'Handwashing SOP',
                                lesson_content:
                                    '<ol><li>Wet hands with clean running water.</li><li>Apply soap and scrub for 20 seconds.</li><li>Rinse and dry with a single-use towel.</li></ol>',
                                lesson_sequence: 1
                            }
                        ]
                    },
                    questions: {
                        create: [
                            {
                                q_type: question_type.single,
                                q_text: 'How long should you scrub your hands with soap?',
                                q_explanation: 'At least 20 seconds removes most germs.',
                                q_sequence: 0,
                                options: {
                                    create: [
                                        { qo_text: '5 seconds', qo_sequence: 0 },
                                        { qo_text: '20 seconds', qo_is_correct: true, qo_sequence: 1 },
                                        { qo_text: 'Only rinse with water', qo_sequence: 2 }
                                    ]
                                }
                            },
                            {
                                q_type: question_type.multiple,
                                q_text: 'When must you wash your hands? (select all that apply)',
                                q_sequence: 1,
                                options: {
                                    create: [
                                        { qo_text: 'Before starting a shift', qo_is_correct: true, qo_sequence: 0 },
                                        { qo_text: 'After handling raw food', qo_is_correct: true, qo_sequence: 1 },
                                        { qo_text: 'Only when hands look dirty', qo_sequence: 2 }
                                    ]
                                }
                            },
                            {
                                q_type: question_type.written,
                                q_text: 'Describe one hygiene risk you have seen at work and how you would fix it.',
                                q_sequence: 2
                            }
                        ]
                    }
                }
            }
        },
        include: { versions: true }
    })
    await prisma.training_modules.update({
        where: { tm_id: foodSafety.tm_id },
        data: { tm_current_version_id: foodSafety.versions[0].mv_id }
    })

    const greeting = await prisma.training_modules.create({
        data: {
            tm_code: 'CS-101',
            tm_category_id: await category('Customer Service'),
            tm_brand_ids: [brandOne.brand_id],
            tm_due_days: 14,
            tm_sequence: 2,
            tm_prerequisite_id: foodSafety.tm_id,
            tm_created_by: SEEDER,
            versions: {
                create: {
                    mv_version_no: 1,
                    mv_state: version_state.published,
                    mv_published_at: new Date(),
                    mv_title: 'Guest Greeting SOP',
                    mv_description: 'How to welcome, seat and thank every guest.',
                    mv_pass_mark: 50,
                    mv_max_attempts: 0,
                    mv_created_by: SEEDER,
                    lessons: {
                        create: {
                            lesson_title: 'The 3-step greeting',
                            lesson_content:
                                '<p><strong>Greet</strong> within 10 seconds, <strong>guide</strong> the guest to a table and <strong>thank</strong> them on exit.</p>'
                        }
                    },
                    questions: {
                        create: {
                            q_type: question_type.single,
                            q_text: 'Within how many seconds should a guest be greeted?',
                            options: {
                                create: [
                                    { qo_text: '10 seconds', qo_is_correct: true, qo_sequence: 0 },
                                    { qo_text: '2 minutes', qo_sequence: 1 }
                                ]
                            }
                        }
                    }
                }
            }
        },
        include: { versions: true }
    })
    await prisma.training_modules.update({
        where: { tm_id: greeting.tm_id },
        data: { tm_current_version_id: greeting.versions[0].mv_id }
    })

    await prisma.training_modules.create({
        data: {
            tm_code: 'OPS-201',
            tm_category_id: await category('Operations'),
            tm_role_ids: [await role('outlet_incharge')],
            tm_is_mandatory: false,
            tm_created_by: SEEDER,
            versions: {
                create: {
                    mv_version_no: 1,
                    mv_title: 'Outlet Opening Checklist',
                    mv_description: 'Draft module for in-charges.',
                    mv_created_by: SEEDER
                }
            }
        }
    })

    const path = await prisma.training_paths.create({
        data: {
            tp_name: 'Team Member Onboarding',
            tp_description: 'Mandatory modules for new team members',
            tp_role_id: teamMemberRole,
            tp_created_by: SEEDER,
            modules: {
                create: [
                    { tpm_module_id: foodSafety.tm_id, tpm_sequence: 0 },
                    { tpm_module_id: greeting.tm_id, tpm_sequence: 1 }
                ]
            }
        }
    })

    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    for (const member of [ravi, neha]) {
        await prisma.users.update({ where: { user_id: member.user_id }, data: { user_path_id: path.tp_id } })

        for (const module of [foodSafety, greeting]) {
            await prisma.assignments.create({
                data: {
                    asg_user_id: member.user_id,
                    asg_module_id: module.tm_id,
                    asg_version_id: module.versions[0].mv_id,
                    asg_source: assignment_source.path,
                    asg_due_at: due,
                    asg_created_by: SEEDER
                }
            })
        }
    }

    await prisma.assignments.create({
        data: {
            asg_user_id: arjun.user_id,
            asg_module_id: foodSafety.tm_id,
            asg_version_id: foodSafety.versions[0].mv_id,
            asg_source: assignment_source.manual,
            asg_due_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            asg_created_by: SEEDER
        }
    })

    await prisma.recipes.create({
        data: {
            recipe_name: 'Masala Chai',
            recipe_code: 'BEV-001',
            recipe_brand_id: brandOne.brand_id,
            recipe_category_id: await category('Beverages'),
            recipe_description: 'House masala chai served in a 200 ml kulhad.',
            recipe_portion_size: '200 ml',
            recipe_yield: '4 cups',
            recipe_prep_time_minutes: 3,
            recipe_cook_time_minutes: 7,
            recipe_equipment: ['Saucepan', 'Strainer', 'Measuring cup'],
            recipe_cooking_instructions: 'Simmer on medium heat; do not let the milk boil over.',
            recipe_plating_instructions: 'Pour through the strainer into a pre-warmed kulhad.',
            recipe_storage_instructions: 'Masala mix: airtight container, dry shelf.',
            recipe_shelf_life: 'Serve within 15 minutes',
            recipe_food_safety: 'Discard milk left unrefrigerated for more than 2 hours.',
            recipe_common_mistakes: ['Boiling tea leaves too long (bitter)', 'Adding sugar before the milk'],
            recipe_quality_checkpoints: ['Colour: light caramel', 'Temperature above 70°C at serving'],
            recipe_is_published: true,
            recipe_published_at: new Date(),
            recipe_created_by: SEEDER,
            ingredients: {
                create: [
                    { ri_name: 'Water', ri_quantity: 400, ri_unit: 'ml', ri_sequence: 0 },
                    { ri_name: 'Milk (full cream)', ri_quantity: 400, ri_unit: 'ml', ri_sequence: 1 },
                    { ri_name: 'Assam CTC tea', ri_quantity: 12, ri_unit: 'g', ri_sequence: 2 },
                    { ri_name: 'Sugar', ri_quantity: 30, ri_unit: 'g', ri_sequence: 3 },
                    { ri_name: 'House masala mix', ri_quantity: 2, ri_unit: 'g', ri_sequence: 4 }
                ]
            },
            steps: {
                create: [
                    {
                        rs_sequence: 0,
                        rs_instruction: 'Bring water to a boil with the masala mix.',
                        rs_duration_minutes: 2
                    },
                    { rs_sequence: 1, rs_instruction: 'Add tea and simmer for 1 minute.', rs_duration_minutes: 1 },
                    {
                        rs_sequence: 2,
                        rs_instruction: 'Add milk and sugar, simmer until it rises twice.',
                        rs_duration_minutes: 4
                    }
                ]
            }
        }
    })

    await prisma.recipes.create({
        data: {
            recipe_name: 'Paneer Tikka Bowl',
            recipe_code: 'MAIN-001',
            recipe_brand_id: brandTwo.brand_id,
            recipe_category_id: await category('Mains'),
            recipe_portion_size: '350 g',
            recipe_is_published: true,
            recipe_published_at: new Date(),
            recipe_created_by: SEEDER,
            ingredients: { create: [{ ri_name: 'Paneer cubes', ri_quantity: 150, ri_unit: 'g' }] },
            steps: { create: [{ rs_instruction: 'Grill marinated paneer for 6 minutes, turning once.' }] }
        }
    })

    console.log('Demo data seeded')
}

async function main() {
    await seedAccessControl()
    await seedSuperAdmin()
    await seedCategories()

    if (process.argv.includes('--demo')) {
        await seedDemo()
    }

    console.log('Seed complete')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
