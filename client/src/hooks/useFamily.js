// src/hooks/useFamily.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFamilySummary,
  getFxRates,
  upsertFxRate,
  syncFxRates
} from '../services/family.service';

export function useFamilySummary() {
  const { data = null, isLoading, isError, refetch } = useQuery({
    queryKey: ['family-summary'],
    queryFn: getFamilySummary,
    staleTime: 1000 * 60,
    retry: 1,
  });
  return { data, isLoading, isError, refetch };
}

export function useFxRates() {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: getFxRates,
    staleTime: 1000 * 60,
    retry: 1,
  });
  return { data, isLoading, isError, refetch };
}

export function useUpsertFxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ currency, data }) => upsertFxRate(currency, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fx-rates'] });
      queryClient.invalidateQueries({ queryKey: ['family-summary'] });
    }
  });
}

export function useSyncFxRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncFxRates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fx-rates'] });
      queryClient.invalidateQueries({ queryKey: ['family-summary'] });
    }
  });
}
