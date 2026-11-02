import type { Prisma } from '@/generated/prisma/client'
import { role_scope } from '@/generated/prisma/enums'
import prisma from '@core/helpers/prisma'
import { AuthUser } from '@core/types/auth'

// Users the viewer may see in lists, dashboards and reports
export function userScopeWhere(viewer: AuthUser): Prisma.usersWhereInput {
    switch (viewer.user_role_relation.role_scope) {
        case role_scope.all:
            return {}
        case role_scope.brand:
            return { user_brand_id: viewer.user_brand_id ?? -1 }
        case role_scope.franchise:
            return { user_outlet: { outlet_franchisee_id: viewer.user_id } }
        case role_scope.outlet:
            return { user_outlet_id: viewer.user_outlet_id ?? -1 }
        default:
            return { user_id: viewer.user_id }
    }
}

// Outlets the viewer may see or filter by
export function outletScopeWhere(viewer: AuthUser): Prisma.outletsWhereInput {
    switch (viewer.user_role_relation.role_scope) {
        case role_scope.all:
            return {}
        case role_scope.brand:
            return { outlet_brand_id: viewer.user_brand_id ?? -1 }
        case role_scope.franchise:
            return { outlet_franchisee_id: viewer.user_id }
        default:
            return { outlet_id: viewer.user_outlet_id ?? -1 }
    }
}

// Brands the viewer may see; null means every brand
export async function viewerBrandIds(viewer: AuthUser): Promise<number[] | null> {
    if (viewer.user_role_relation.role_scope === role_scope.all) {
        return null
    }

    const brandIds = new Set<number>()

    if (viewer.user_brand_id) {
        brandIds.add(viewer.user_brand_id)
    }

    if (viewer.user_outlet?.outlet_brand_id) {
        brandIds.add(viewer.user_outlet.outlet_brand_id)
    }

    if (viewer.user_role_relation.role_scope === role_scope.franchise) {
        const outlets = await prisma.outlets.findMany({
            select: { outlet_brand_id: true },
            where: { outlet_franchisee_id: viewer.user_id, outlet_deleted: false }
        })
        outlets.forEach((o) => brandIds.add(o.outlet_brand_id))
    }

    return Array.from(brandIds)
}

export async function canViewUser(viewer: AuthUser, user_id: number) {
    const count = await prisma.users.count({
        where: { AND: [userScopeWhere(viewer), { user_id, user_deleted: false }] }
    })

    return count > 0
}

export async function canViewOutlet(viewer: AuthUser, outlet_id: number) {
    const count = await prisma.outlets.count({
        where: { AND: [outletScopeWhere(viewer), { outlet_id, outlet_deleted: false }] }
    })

    return count > 0
}
