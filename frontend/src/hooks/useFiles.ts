import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    fileService,
    type FileListParams,
    type FileUsageEntity,
} from '@/services/fileService';

const FILES_KEY = 'files';
const FOLDERS_KEY = 'file-folders';

export const useFiles = (params: FileListParams) => useQuery({
    queryKey: [FILES_KEY, params],
    queryFn: () => fileService.list(params),
});

export const useFile = (id: number | null) => useQuery({
    queryKey: [FILES_KEY, 'detail', id],
    queryFn: () => fileService.get(id as number),
    enabled: id !== null,
});

export const useFileFolders = () => useQuery({
    queryKey: [FOLDERS_KEY],
    queryFn: () => fileService.listFolders(),
});

/** Yuklashdan keyin papka roʻyxati ham yangilanadi: fayl soni oʻzgaradi. */
const invalidateAll = (queryClient: ReturnType<typeof useQueryClient>) => {
    queryClient.invalidateQueries({ queryKey: [FILES_KEY] });
    queryClient.invalidateQueries({ queryKey: [FOLDERS_KEY] });
};

export const useUploadFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, folderId }: { file: File; folderId?: number }) =>
            fileService.upload(file, folderId),
        onSuccess: () => invalidateAll(queryClient),
    });
};

export const useUpdateFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            data,
        }: {
            id: number;
            data: { title?: string; folder_id?: number; move_to_root?: boolean };
        }) => fileService.update(id, data),
        onSuccess: () => invalidateAll(queryClient),
    });
};

export const useDeleteFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => fileService.remove(id),
        onSuccess: () => invalidateAll(queryClient),
    });
};

export const useAttachFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            entityType,
            entityId,
        }: {
            id: number;
            entityType: FileUsageEntity;
            entityId: number;
        }) => fileService.attach(id, { entity_type: entityType, entity_id: entityId }),
        onSuccess: () => invalidateAll(queryClient),
    });
};

export const useCreateFolder = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string; parent_id?: number }) => fileService.createFolder(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [FOLDERS_KEY] }),
    });
};

export const useRenameFolder = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name }: { id: number; name: string }) =>
            fileService.updateFolder(id, { name }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [FOLDERS_KEY] }),
    });
};

export const useDeleteFolder = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => fileService.deleteFolder(id),
        onSuccess: () => invalidateAll(queryClient),
    });
};
