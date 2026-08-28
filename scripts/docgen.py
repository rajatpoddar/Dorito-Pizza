#!/usr/bin/env python3
"""Generate 6 project documentation files (PRD, ARCHITECTURE, RULES, PHASE, DESIGN, MEMORY)."""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DOCS = {}

DOCS['PRD.md'] = """# 📋 Product Requirements Document (PRD) - Dorito Pizza and Bakery

## 1. Executive Summary
Dorito Pizza and Bakery is a production-ready food ordering platform with 4 role-based applications sharing one Flask REST API + PostgreSQL database and one React SPA. The platform enables customers to browse menu, place orders, track deliveries, and provides managers/kitchen/delivery staff with specialized interfaces for order management.

## 2. Problem Statement
Traditional restaurant ordering systems are fragmented, lack real-time tracking, and don't provide integrated management capabilities. Dorito needed a unified platform for online ordering, kitchen operations, delivery management, and customer engagement via WhatsApp.

## 3. Target Users & Roles

### 3.1 Customer (Public App)
- Browse menu by category, add items to cart (1-20 qty)
- Checkout with COD/UPI, WhatsApp OTP authentication (6-digit code)
- Live order tracking: Pending → Preparing → Ready → Out for Delivery → Delivered
- Order history, discount offers, guest checkout with OTP linking

### 3.2 Manager (Admin Panel /admin)
- Dashboard (daily sales, active orders, status breakdown)
- Full menu CRUD, order management (assign agents, cancel, filter)
- Staff management (create/activate/deactivate)
- Offers/discounts CRUD, analytics, marketing broadcast, WhatsApp status, outbox audit

### 3.3 Kitchen Staff (KDS /kitchen)
- Real-time order queue with 4-second polling
- Visual board: Pending → Preparing → Ready
- One-click status advancement, order details, agent visibility

### 3.4 Delivery Agent App (/delivery)
- Assigned orders queue with 5-second polling
- Customer info, payment details, 4-digit OTP verification
- Order history, auto-refresh, mark delivered with OTP confirmation
"""
print("Wrote PRD.md (part 1)")
print("done")