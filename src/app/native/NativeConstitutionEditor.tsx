import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { type EditorProps } from './editor-props'
import { ruleFields, serializeRule } from './constitution-form'

export function ConstitutionEditor({
  model,
  send,
  stableId,
  stamp,
}: EditorProps) {
  const [error, setError] = useState('')
  const campaign = model.rows.campaigns[0]!
  const current =
    model.activeConstitution ??
    model.rows.constitutions.reduce<
      (typeof model.rows.constitutions)[number] | undefined
    >((a, b) => (!a || b.version > a.version ? b : a), undefined)
  if (!current)
    return (
      <p>
        This save has no constitution. Create a native career with a board
        preset to initialize one.
      </p>
    )
  const locked = campaign.rulesMode === 'challenge'
  return (
    <section className="space-y-3">
      <h2>Edit board rules</h2>
      <p>
        {locked
          ? 'Challenge rules are locked.'
          : 'Rules change prospectively. Editing the opening allocation does not add money to an existing allocation.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (locked) return
          setError('')
          try {
            const data = new FormData(e.currentTarget)
            const rules = current.rules.map((rule) => serializeRule(rule, data))
            void send({
              type: 'save-constitution',
              allocationId: stableId('allocation'),
              constitution: {
                id: stableId('constitution'),
                campaignId: campaign.id,
                version: 0,
                updatedAt: stamp,
                rules,
              },
            })
          } catch (error) {
            setError(
              error instanceof Error ? error.message : 'Check the rule fields.',
            )
          }
        }}
      >
        <fieldset disabled={locked} className="space-y-4">
          {current.rules.map((rule) => (
            <fieldset
              key={rule.id}
              className="flex flex-wrap gap-4 border border-[var(--border)] p-3"
            >
              <legend>{rule.id.replaceAll('_', ' ')}</legend>
              {ruleFields(rule).map(({ key, label, kind, value }) => (
                <label key={key}>
                  {label}{' '}
                  <input
                    name={`${rule.id}.${key}`}
                    type={
                      kind === 'checkbox'
                        ? 'checkbox'
                        : kind === 'text'
                          ? 'text'
                          : 'number'
                    }
                    min={
                      kind === 'integer' || kind === 'nullable' ? 0 : undefined
                    }
                    step={
                      kind === 'integer' || kind === 'nullable' ? 1 : undefined
                    }
                    required={kind === 'integer' || kind === 'text'}
                    defaultChecked={
                      kind === 'checkbox' ? value === true : undefined
                    }
                    defaultValue={
                      typeof value === 'boolean' ? undefined : (value ?? '')
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <Button type="submit">Save constitution</Button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  )
}
