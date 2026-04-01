import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import type { Expense, ExpenseSplit, ExpenseCategory } from '../../types/api';
import { useTripStore } from '../../store/tripStore';
import { formatCurrency, simplifyDebts } from '../../lib/currencyUtils';

type ExpenseSummary = {
  user_id: string;
  name: string;
  total_paid: number;
  total_owed: number;
  balance: number;
};

const CATEGORIES: ExpenseCategory[] = ['food', 'transport', 'accommodation', 'activities', 'shopping', 'other'];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food: '#f59e0b',
  transport: '#6366f1',
  accommodation: '#10b981',
  activities: '#ec4899',
  shopping: '#8b5cf6',
  other: '#94a3b8',
};

const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: '🍔',
  transport: '🚗',
  accommodation: '🏨',
  activities: '🎯',
  shopping: '🛍️',
  other: '💼',
};

// ─── Expense Form Modal ───────────────────────────────────────────────────────

function ExpenseFormModal({
  tripId,
  editExpense,
  onClose,
}: {
  tripId: string;
  editExpense: Expense | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { members } = useTripStore();
  const [form, setForm] = useState({
    title: editExpense?.title ?? '',
    amount: editExpense?.amount != null ? String(editExpense.amount) : '',
    currency: editExpense?.currency ?? 'USD',
    category: editExpense?.category ?? ('other' as ExpenseCategory),
    paid_by: editExpense?.paid_by ?? '',
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post<Expense>('/expenses', {
        trip_id: tripId,
        ...data,
        amount: Number(data.amount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', tripId] });
      queryClient.invalidateQueries({ queryKey: ['expense-summary', tripId] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch<Expense>(`/expenses/${editExpense!.id}`, {
        ...data,
        amount: Number(data.amount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', tripId] });
      queryClient.invalidateQueries({ queryKey: ['expense-summary', tripId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editExpense) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          {editExpense ? 'Edit Expense' : 'Add Expense'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="Title *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount *"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <input
              placeholder="USD"
              maxLength={3}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Paid by</label>
              <select
                required
                value={form.paid_by}
                onChange={(e) => setForm({ ...form, paid_by: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {isPending ? 'Saving…' : editExpense ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Budget Charts ────────────────────────────────────────────────────────────

function BudgetCharts({ expenses, currency }: { expenses: Expense[]; currency: string }) {
  // Category breakdown pie chart
  const categoryTotals = CATEGORIES.map((cat) => ({
    name: cat.charAt(0).toUpperCase() + cat.slice(1),
    value: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    color: CATEGORY_COLORS[cat],
  })).filter((c) => c.value > 0);

  if (!categoryTotals.length) return null;

  const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Pie: by category */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">By Category</h3>
        <p className="mb-3 text-2xl font-bold text-gray-900">{formatCurrency(totalSpend, currency)}</p>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={categoryTotals}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {categoryTotals.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Placeholder for per-person bar chart — populated via summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Category Breakdown</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={categoryTotals} layout="vertical">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {categoryTotals.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Settlement View ──────────────────────────────────────────────────────────

function SettlementView({
  summary,
  currency,
}: {
  summary: ExpenseSummary[];
  currency: string;
}) {
  const balances = Object.fromEntries(summary.map((s) => [s.name, s.balance]));
  const transfers = simplifyDebts(balances);

  if (!transfers.length) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-green-700 font-medium">All settled up! 🎉</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Suggested Settlements</h3>
      <div className="space-y-2">
        {transfers.map((t, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
            <span>
              <span className="font-medium text-gray-900">{t.from}</span>
              <span className="mx-2 text-gray-400">→</span>
              <span className="font-medium text-gray-900">{t.to}</span>
            </span>
            <span className="font-semibold text-amber-700">{formatCurrency(t.amount, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Expense Row ──────────────────────────────────────────────────────────────

function ExpenseRow({
  expense,
  paidByName,
  canEdit,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  paidByName: string;
  canEdit: boolean;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
}) {
  const [showSplits, setShowSplits] = useState(false);
  const { data: splits = [] } = useQuery({
    queryKey: ['expense-splits', expense.id],
    queryFn: () => api.get<ExpenseSplit[]>(`/expenses/${expense.id}/splits`),
    enabled: showSplits,
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl">{CATEGORY_ICONS[expense.category]}</span>
          <div>
            <p className="font-medium text-gray-900">{expense.title}</p>
            <p className="text-xs text-gray-400">Paid by {paidByName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">
            {formatCurrency(expense.amount, expense.currency)}
          </span>
          {canEdit && (
            <>
              <button onClick={() => onEdit(expense)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">✏️</button>
              <button onClick={() => onDelete(expense.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">🗑️</button>
            </>
          )}
        </div>
      </div>
      <button
        onClick={() => setShowSplits((s) => !s)}
        className="mt-2 text-xs text-indigo-500 hover:text-indigo-700"
      >
        {showSplits ? 'Hide splits ▲' : 'Show splits ▼'}
      </button>
      {showSplits && splits.length > 0 && (
        <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2">
          {splits.map((s) => (
            <div key={s.user_id} className="flex justify-between text-xs">
              <span className="text-gray-600">{s.name}</span>
              <span className={s.user_id === expense.paid_by ? 'font-medium text-green-600' : 'text-gray-500'}>
                {formatCurrency(s.amount, expense.currency)}
                {s.user_id === expense.paid_by && ' (payer)'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { currentTrip, members, userRole } = useTripStore();
  const queryClient = useQueryClient();
  const canEdit = userRole === 'owner' || userRole === 'editor';
  const [showModal, setShowModal] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'charts' | 'settle'>('list');

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', tripId],
    queryFn: () => api.get<Expense[]>(`/expenses?tripId=${tripId}`),
    enabled: !!tripId,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['expense-summary', tripId],
    queryFn: () => api.get<ExpenseSummary[]>(`/expenses/summary?tripId=${tripId}`),
    enabled: !!tripId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', tripId] });
      queryClient.invalidateQueries({ queryKey: ['expense-summary', tripId] });
    },
  });

  const memberMap = Object.fromEntries(members.map((m) => [m.user_id, m.name]));
  const currency = currentTrip?.base_currency ?? 'USD';
  const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="p-4 pb-20 md:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Expenses</h2>
          <p className="text-sm text-gray-400">
            {expenses.length} expenses · {formatCurrency(totalSpend, currency)} total
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditExpense(null); setShowModal(true); }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add
          </button>
        )}
      </div>

      {/* Per-person balances */}
      {summary.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {summary.map((s) => (
            <div key={s.user_id} className="flex min-w-[120px] flex-col rounded-xl border border-gray-200 bg-white p-3">
              <span className="truncate text-xs font-medium text-gray-700">{s.name}</span>
              <span className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(s.total_paid, currency)}</span>
              <span className={`text-xs ${s.balance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {s.balance >= 0 ? '+' : ''}{formatCurrency(s.balance, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b">
        {(['list', 'charts', 'settle'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition ${activeTab === tab ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab === 'list' ? 'List' : tab === 'charts' ? 'Charts' : 'Settle Up'}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />)}
        </div>
      ) : activeTab === 'list' ? (
        <div className="space-y-3">
          {expenses.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
              <p className="text-2xl">💰</p>
              <p className="mt-2 text-sm">No expenses yet</p>
            </div>
          ) : (
            expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                paidByName={memberMap[expense.paid_by] ?? 'Unknown'}
                canEdit={canEdit}
                onEdit={(e) => { setEditExpense(e); setShowModal(true); }}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))
          )}
        </div>
      ) : activeTab === 'charts' ? (
        <BudgetCharts expenses={expenses} currency={currency} />
      ) : (
        <SettlementView summary={summary} currency={currency} />
      )}

      {/* Expense Form Modal */}
      {showModal && tripId && (
        <ExpenseFormModal
          tripId={tripId}
          editExpense={editExpense}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
