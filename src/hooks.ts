import { useCallback, useRef } from 'react';

export function useEvent<T extends () => void>(cb: T) {
    const refCb = useRef(cb);
    refCb.current = cb;

    const callback = useCallback(
        ((...args) => {
            return refCb.current(...args);
        }) as T,
        []
    );

    return callback;
}
