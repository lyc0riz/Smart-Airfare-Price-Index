import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Test"><p>Body</p></Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a labelled dialog when open', () => {
    render(<Modal isOpen onClose={() => {}} title="Confirm"><p>Body</p></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Confirm' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('calls onClose via Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Modal isOpen onClose={onClose} title="Confirm"><p>Body</p></Modal>)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose via the close button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Modal isOpen onClose={onClose} title="Confirm"><p>Body</p></Modal>)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} title="Confirm"><p>Body</p></Modal>)
    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })
})