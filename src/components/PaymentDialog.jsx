import { useEffect, useRef, useState } from 'react'
import Icon from './ui/Icon.jsx'
import { Button, Modal, Field, Textarea } from './ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { inr } from '../lib/format.js'

// Read an uploaded file to a data URL so the proof can be previewed / downloaded
// without a backend (mirrors the checkout document-upload pattern).
const readFile = (file) =>
  new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res({ name: file.name, url: r.result, size: file.size })
    r.readAsDataURL(file)
  })

const kb = (n) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : '')

// Confirm-payment modal shared by InventoryDetail and Finance. Marking a payment
// as paid requires a free-text note/reference AND a proof-of-payment upload.
export default function PaymentDialog({ inv, which, open, onClose }) {
  const { recordPayment } = useApp()
  const [note, setNote] = useState('')
  const [proof, setProof] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (open) { setNote(''); setProof(null) }
  }, [open, which, inv?.id])

  if (!inv || !which) return null

  const isAdvance = which === 'advance'
  const amount = isAdvance ? inv.advanceAmount : inv.balanceAmount
  const label = isAdvance ? 'Advance (20%)' : 'Balance (80%)'
  const ready = note.trim().length > 0 && !!proof

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setProof(await readFile(f))
    e.target.value = ''
  }

  const confirm = () => {
    if (!ready) return
    recordPayment(inv.id, which, { note: note.trim(), proof })
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mark ${label} as paid`}
      subtitle={`${inv.inventoryId} · ${inv.airline}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" disabled={!ready} onClick={confirm}>Confirm payment</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
          <span className="text-sm font-semibold">{label}</span>
          <span className="tabular-nums text-base font-bold">{inr(amount)}</span>
        </div>

        <Field label="Payment note / reference" required hint="e.g. UTR / transaction ref, bank and mode of payment.">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Paid via NEFT — UTR 1234567890, HDFC current a/c, cleared today."
          />
        </Field>

        <div>
          <span className="text-[13px] font-semibold">
            Proof of payment <span className="text-[#b01f31]">*</span>
          </span>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onFile} />
          {proof ? (
            <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="paperclip" size={15} className="shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{proof.name}</span>
                  {proof.size ? <span className="block text-xs text-muted-foreground">{kb(proof.size)}</span> : null}
                </span>
              </span>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => setProof(null)}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-muted"
            >
              <Icon name="plus" size={15} /> Upload receipt (image / PDF)
            </button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Required — attach a screenshot or PDF of the transfer for the audit trail.
          </p>
        </div>
      </div>
    </Modal>
  )
}
