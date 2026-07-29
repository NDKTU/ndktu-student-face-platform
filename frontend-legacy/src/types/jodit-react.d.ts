declare module 'jodit-react' {
    import * as React from 'react';

    export interface JoditProps {
        value?: string;
        onChange?: (newValue: string) => void;
        onBlur?: (newValue: string) => void;
        config?: any;
        className?: string;
        id?: string;
        name?: string;
        tabIndex?: number;
        editorRef?: (ref: any) => void;
    }

    const JoditEditor: React.ForwardRefExoticComponent<JoditProps & React.RefAttributes<any>>;
    export default JoditEditor;
}
