// src/hooks/useAlerts.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  getAlertEvents,
  getUnreadAlertCount,
  markAlertEventRead,
  evaluateAlerts
} from '../services/alert.service';

export function useAlertRules(params = {}) {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['alert-rules', params],
    queryFn: () => getAlertRules(params),
    staleTime: 1000 * 60,
    retry: 1,
  });
  return { data, isLoading, isError, refetch };
}

export function useAlertEvents(params = {}) {
  const { enabled = true, ...query } = params;
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['alert-events', query],
    queryFn: () => getAlertEvents(query),
    enabled,
    staleTime: 1000 * 30,
    retry: 1,
  });
  return { data, isLoading, isError, refetch };
}

/** Dashboard 顶部未读徽标：全局轮询，5 秒刷新 */
export function useUnreadAlertCount() {
  const queryClient = useQueryClient();
  const { data = { count: 0 }, refetch } = useQuery({
    queryKey: ['alert-unread-count'],
    queryFn: getUnreadAlertCount,
    refetchInterval: 5000,
    retry: 1,
  });
  return {
    count: data.count ?? 0,
    refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['alert-unread-count'] })
  };
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateAlertRule(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
  });
}

export function useMarkAlertEventRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => markAlertEventRead(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-events'] });
      queryClient.invalidateQueries({ queryKey: ['alert-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios-summary'] });
    }
  });
}

export function useEvaluateAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: evaluateAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-events'] });
      queryClient.invalidateQueries({ queryKey: ['alert-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios-summary'] });
    }
  });
}
