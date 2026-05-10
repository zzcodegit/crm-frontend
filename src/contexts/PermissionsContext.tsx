import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type GroupItem } from "../api";
import { useAuth } from "./AuthContext";
import {
  APP_SECTIONS,
  clearPermissionsMap,
  loadPermissionsMap,
  normalizePermissionsMap,
  sectionKeyFromPath,
  type GroupPermissionsMap,
  type SectionKey,
} from "../permissions";

const PermissionsContext = createContext<{
  groups: GroupItem[];
  loading: boolean;
  groupPermissions: GroupPermissionsMap;
  setGroupDeniedSections: (groupId: number, deniedSections: SectionKey[]) => void;
  isSectionAllowed: (sectionKey: SectionKey) => boolean;
  isPathAllowed: (pathname: string) => boolean;
  firstAllowedPath: string;
} | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupPermissions, setGroupPermissions] = useState<GroupPermissionsMap>({});

  const inferredGroupIdsByRole = useMemo(() => {
    const role = user?.role?.toLowerCase();
    if (!role) return [];
    const roleMatchers: Record<string, string[]> = {
      consultant: ["консульт", "consult"],
      manager: ["менедж", "manager"],
      admin: ["админ", "admin"],
    };
    const matchers = roleMatchers[role] ?? [];
    if (matchers.length === 0) return [];
    return groups
      .filter((group) => {
        const name = group.name.toLowerCase();
        return matchers.some((part) => name.includes(part));
      })
      .map((group) => group.id);
  }, [groups, user?.role]);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setGroupPermissions({});
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    const canManageGroups = user?.role === "admin" || Boolean(user?.is_admin);
    const groupsPromise = canManageGroups ? api.getGroups() : Promise.resolve<GroupItem[]>([]);
    Promise.allSettled([groupsPromise, api.getGroupPermissions()])
      .then((results) => {
        if (!mounted) return;
        const [groupsResult, permissionsResult] = results;
        if (groupsResult.status === "fulfilled") {
          setGroups(groupsResult.value);
        } else {
          setGroups([]);
        }
        if (permissionsResult.status === "fulfilled") {
          setGroupPermissions(normalizePermissionsMap(permissionsResult.value.permissions ?? {}));
        } else {
          setGroupPermissions(loadPermissionsMap());
        }
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  const deniedByUserGroups = useMemo(() => {
    const denied = new Set<SectionKey>();
    const directGroupIds = user?.group_ids ?? [];
    const userGroupIds = directGroupIds.length > 0 ? directGroupIds : inferredGroupIdsByRole;
    userGroupIds.forEach((groupId) => {
      const deniedForGroup = groupPermissions[String(groupId)] ?? [];
      deniedForGroup.forEach((key) => denied.add(key));
    });
    return denied;
  }, [groupPermissions, inferredGroupIdsByRole, user?.group_ids]);

  const isSectionAllowed = useCallback(
    (sectionKey: SectionKey) => {
      const isAdmin = user?.role === "admin" || Boolean(user?.is_admin);
      if (isAdmin) return true;
      return !deniedByUserGroups.has(sectionKey);
    },
    [deniedByUserGroups, user?.is_admin, user?.role]
  );

  const isPathAllowed = useCallback(
    (pathname: string) => {
      const sectionKey = sectionKeyFromPath(pathname);
      if (!sectionKey) return true;
      return isSectionAllowed(sectionKey);
    },
    [isSectionAllowed]
  );

  const firstAllowedPath = useMemo(() => {
    const first = APP_SECTIONS.find((section) => isSectionAllowed(section.key));
    return first?.basePath ?? "/";
  }, [isSectionAllowed]);

  const setGroupDeniedSections = useCallback((groupId: number, deniedSections: SectionKey[]) => {
    setGroupPermissions((prev) => {
      const next = { ...prev, [String(groupId)]: [...new Set(deniedSections)] };
      api.updateGroupPermissions(next).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    // cleanup old client-only storage to avoid confusing stale values
    clearPermissionsMap();
  }, []);

  return (
    <PermissionsContext.Provider
      value={{
        groups,
        loading,
        groupPermissions,
        setGroupDeniedSections,
        isSectionAllowed,
        isPathAllowed,
        firstAllowedPath,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}
