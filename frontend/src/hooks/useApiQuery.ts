import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'
import { buildProvider } from '../lib/build/provider'
import type { DataProvider } from '../lib/data-provider'

export function useApiQuery<TData, TError = Error>(
  key: readonly unknown[],
  fetcher: (provider: DataProvider) => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<TData, TError>({
    queryKey: key,
    queryFn: () => fetcher(buildProvider),
    ...options,
  })
}

export function useApiMutation<TData, TVariables, TError = Error>(
  fetcher: (provider: DataProvider, variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'>
) {
  return useMutation<TData, TError, TVariables>({
    mutationFn: (variables) => fetcher(buildProvider, variables),
    ...options,
  })
}