// src/hooks/useTransactionImport.js
// 流水导入（Spec #93）相关的 TanStack Query hooks（代码审查 T7）：页面经 hook 调用
// services/transactionImport.service.js，不直接调用 service；写操作完成后按 queryKey 失效相关缓存。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  commitImport,
  discardStagedTransfer,
  getImportFormat,
  listSourceAccounts,
  listStagedTransfers,
  previewImport,
  reconcileSourceAccountCash,
} from '../services/transactionImport.service';

export const IMPORT_QUERY_KEYS = Object.freeze({
  format: ['transaction-import', 'format'],
  sourceAccounts: ['source-accounts'],
  stagedTransfers: ['transaction-import', 'staged-transfers'],
});

/** 导入格式说明（列、动作、上限、格式 / 二进制格式 / 可选时区） */
export function useImportFormat() {
  return useQuery({ queryKey: IMPORT_QUERY_KEYS.format, queryFn: getImportFormat, staleTime: Infinity, retry: 1 });
}

/** 来源账户列表（导入页选择、交易表来源列、现金核对共用） */
export function useSourceAccounts() {
  return useQuery({ queryKey: IMPORT_QUERY_KEYS.sourceAccounts, queryFn: listSourceAccounts, staleTime: 1000 * 60, retry: 1 });
}

/** 暂存待配对的证券划转一端（TASK-099） */
export function useStagedTransfers() {
  return useQuery({ queryKey: IMPORT_QUERY_KEYS.stagedTransfers, queryFn: () => listStagedTransfers(), retry: 1 });
}

export function useDiscardStagedTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: discardStagedTransfer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: IMPORT_QUERY_KEYS.stagedTransfers }),
  });
}

/** 预览（只读）：服务端重算完整批次 */
export function useImportPreview() {
  return useMutation({ mutationFn: previewImport });
}

/** 确认导入：成功后来源账户、暂存划转与交易列表都可能变化 */
export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commitImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IMPORT_QUERY_KEYS.sourceAccounts });
      queryClient.invalidateQueries({ queryKey: IMPORT_QUERY_KEYS.stagedTransfers });
      queryClient.invalidateQueries({ queryKey: ['portfolio-transactions'] });
    },
  });
}

/** 来源账户现金核对（TASK-103）：POST 只为携带用户填写的余额，不改任何数据 */
export function useCashReconciliation() {
  return useMutation({ mutationFn: ({ id, ...input }) => reconcileSourceAccountCash(id, input) });
}
