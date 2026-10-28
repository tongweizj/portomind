// src/hooks/useUsers.js
// TASK-058 U3：管理员用户管理的 Query + Mutation（FS §4.4 / U3-R1·R3）。
// 服务层已解包响应体：listUsers() → { items:[...] }；createUser/updateUser → { user }；resetUserPassword → { ok:true }。
// 约定：mutation 只负责失效 ['users'] 缓存；成功提示与失败（含 409 LAST_ADMIN_PROTECTED 等）由页面
// await mutateAsync 自行处理后端 message，保证「不静默失败」（D-9）。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword
} from '../services/auth.service';

const USERS_KEY = ['users'];

/** 用户列表（创建时间倒序由服务端保证）。空对象兜底为 []，页面直接按数组渲染。
 *  enabled=false 用于非 admin：不要为必然 403 的请求制造噪声（403 屏由页面渲染）。 */
export function useUsers({ enabled = true } = {}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: USERS_KEY,
    queryFn: listUsers,
    staleTime: 60000,
    retry: 1,
    enabled,
  });
  return { data: data?.items ?? [], isLoading, isError, refetch };
}

/** 新建用户（初始密码由管理员设定 → 对方首次登录强制改密）。 */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** 更新用户（改角色 / 停用启用）。后端对「最后一个启用 admin」「不能停用自己」返回 409。 */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => updateUser(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** 重置他人密码（D9：不能对自己；目标用户全部会话失效 + 下次登录强制改密）。 */
export function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newPassword }) => resetUserPassword(id, newPassword),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
