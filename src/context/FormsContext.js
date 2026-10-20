import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import FormSheet from '../components/forms/FormSheet';

const FormsContext = createContext(null);

// In-app "Get seen" and "Contact BOA" forms, available from any screen.
// Submissions are kept in local state for now.
// TODO: POST to a BOA endpoint (or email service) once one exists.
export function FormsProvider({ children }) {
  const [sheet, setSheet] = useState({ kind: 'getSeen', open: false, initialValues: null });
  const [submissions, setSubmissions] = useState([]);

  const submit = useCallback(
    async (values) => {
      // Short beat so "sending" reads as real, without a backend yet.
      await new Promise((r) => setTimeout(r, 700));
      setSubmissions((list) => [{ id: `${Date.now()}`, kind: sheet.kind, values, at: new Date().toISOString() }, ...list]);
    },
    [sheet.kind],
  );

  const value = useMemo(
    () => ({
      submissions,
      openGetSeen: () => setSheet({ kind: 'getSeen', open: true, initialValues: null }),
      openContact: (initialValues = null) => setSheet({ kind: 'contact', open: true, initialValues }),
    }),
    [submissions],
  );

  return (
    <FormsContext.Provider value={value}>
      {children}
      <FormSheet
        kind={sheet.kind}
        open={sheet.open}
        initialValues={sheet.initialValues}
        onSubmit={submit}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </FormsContext.Provider>
  );
}

export function useForms() {
  const ctx = useContext(FormsContext);
  if (!ctx) throw new Error('useForms must be used inside <FormsProvider>');
  return ctx;
}
