const uploadType = {
    IMAGE: 'image',
    DOCUMENT: 'document'
}

export const UPLOAD_MIME_TYPES: Record<string, string[]> = {
    [uploadType.IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
    [uploadType.DOCUMENT]: ['application/pdf']
}

export default uploadType
