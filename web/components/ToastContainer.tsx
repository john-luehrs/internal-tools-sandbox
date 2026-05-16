"use client";

import React from "react";
import { Toast } from "@/lib/useToast";

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => onDismiss(toast.id)}
          role="status"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
