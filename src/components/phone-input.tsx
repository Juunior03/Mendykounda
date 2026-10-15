/**
 * Champ téléphone : indicatif (+221 par défaut) + chiffres uniquement,
 * mis en forme pendant la saisie. Renvoie « +221 77 123 45 67 », ou ""
 * si le champ est vide. Bloque l'envoi du formulaire si le format est faux.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  COUNTRIES,
  formatLocal,
  formatPhone,
  maxDigits,
  parsePhone,
  phoneError,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

export function PhoneInput({
  value,
  onChange,
  required = false,
  id,
  className,
  autoComplete = "tel-national",
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  className?: string;
  autoComplete?: string;
}) {
  const parsed = parsePhone(value);
  const [code, setCode] = useState(parsed.code);
  const [local, setLocal] = useState(parsed.local);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // Valeur modifiée de l'extérieur (ex. profil chargé après coup) : on se
  // resynchronise pendant le rendu, comme le recommande React.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (formatPhone(code, local) !== (value ?? "")) {
      const p = parsePhone(value);
      setCode(p.code);
      setLocal(p.local);
    }
  }

  let error: string | null = null;
  if (local) error = phoneError(code, local);
  else if (required) error = "Numéro de téléphone requis.";

  // Message natif : empêche l'envoi du formulaire tant que le numéro est faux.
  useEffect(() => {
    inputRef.current?.setCustomValidity(error ?? "");
  }, [error]);

  const emit = (c: string, l: string) => onChange(formatPhone(c, l));

  const onInput = (raw: string) => {
    const trimmed = raw.trim();
    const digits = raw.replace(/\D/g, "");
    const international = trimmed.startsWith("+") || trimmed.startsWith("00");
    // Numéro collé avec son indicatif (« +221 77 … », « 00221… », « 221771234567 »).
    if (international || digits.length > maxDigits(code)) {
      const p = parsePhone(international ? trimmed : digits);
      const l = p.local.slice(0, maxDigits(p.code));
      setCode(p.code);
      setLocal(l);
      emit(p.code, l);
      return;
    }
    setLocal(digits);
    emit(code, digits);
  };

  const showError = touched && !!error;

  return (
    <div className={className}>
      <div
        className={cn(
          "mt-1 flex rounded-md border bg-background text-sm focus-within:border-primary",
          showError ? "border-destructive" : "border-border",
        )}
      >
        <select
          aria-label="Indicatif du pays"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            const l = local.slice(0, maxDigits(e.target.value));
            setLocal(l);
            emit(e.target.value, l);
          }}
          className="shrink-0 rounded-l-md border-r border-border bg-secondary px-2 py-2 text-sm focus:outline-none"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} +{c.code}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          value={formatLocal(code, local)}
          onChange={(e) => onInput(e.target.value)}
          onBlur={() => setTouched(true)}
          onInvalid={() => setTouched(true)}
          required={required}
          placeholder={code === "221" ? "77 123 45 67" : "Numéro"}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          className="min-w-0 flex-1 rounded-r-md bg-transparent px-3 py-2 tabular-nums focus:outline-none"
        />
      </div>
      {showError && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
