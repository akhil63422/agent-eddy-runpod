# Gamified EDI Visual Mapper

A complete gamified EDI mapping tool that transforms raw pipe-delimited data into X12 format using a circuit-building metaphor.

## Features

### 🎮 Game Mechanics

- **Scoring System**: Earn points for creating connections, adding nodes, and error-free runs
- **Leveling System**: Gain XP and level up based on your mapping complexity
- **Badges**: Unlock achievements for perfect runs and efficient mappings
- **Leaderboard Ready**: Score tracking for competitive play

### 🔌 Circuit Building

- **Energy Sources (Input)**: Raw data fields displayed as glowing orbs
- **Power Grid Sockets (Output)**: X12 structure as buildable circuit board
- **Power Converters (Transform Nodes)**: Math, concatenation, formatting operations
- **Challenge Gates (Validation Nodes)**: Mandatory, type, length, regex, custom script validations

### ✨ Visual Effects

- **Animated Energy Flow**: Particle effects travel along connections during simulation
- **Gate Animations**: 
  - Green glow when validation passes
  - Red sparks/explosions on failure
  - Shake animation for failed gates
- **Connection States**:
  - Idle: Faint steady glow
  - Active: Pulsing light animation
  - Broken: Jagged red lines with glitch effect

### 🎯 Sample Mapping

**Input**: `Invoice|12345|20231001|VendorX|Item1|5|10.00|Item2|3|15.00|Total|75.00`

**Output**: X12 810 Invoice structure

**Preset Mapping**:
- input-2 (20231001) → BIG01 (Invoice Date)
- input-1 (12345) → BIG02 (Invoice Number)
- input-3 (VendorX) → N102 (Vendor Name)
- input-5 (5) → IT101 (Quantity)
- input-6 (10.00) → IT102 (Unit Price)
- input-11 (75.00) → TDS01 (Total Amount)

## Usage

1. **Load Sample Data**: Click "Load Sample" in the Input Pane
2. **Load Preset Mapping**: Click "Load Preset" to see example connections
3. **Create Connections**: Drag from input nodes to output nodes
4. **Add Processing Nodes**: Click "Add Node" to add transforms or validations
5. **Run Simulation**: Click "Run Energy Flow" to test your mapping
6. **Save Configuration**: Save your circuit for later use

## Node Types

### Input Node
- Source of raw data
- Blue glowing orb
- Draggable connection point on right

### Output Node
- X12 target field
- Purple socket
- Connection point on left

### Transform Node
- Math operations, concatenation, formatting
- Green color scheme
- Input and output handles

### Validation Gate Node
- Rule-based validation
- Yellow/Red/Green based on status
- Configurable rules:
  - Required
  - Type Check
  - Length
  - Regex Pattern
  - Custom Script (Code Spell)

## Scoring

- **Connection Created**: +10 points
- **Node Added**: +5 points
- **Preset Loaded**: +20 points
- **Configuration Saved**: +50 points
- **Error-Free Run**: +100 points + Badge

## Tech Stack

- **React Flow** (@xyflow/react): Node-based graph visualization
- **Framer Motion**: Smooth animations
- **Konva/React-Konva**: Canvas-based particle effects
- **Zustand**: State management
- **Tailwind CSS**: Styling with sci-fi theme

## File Structure

```
components/mapper/
├── GameHUD.jsx          # Score, level, badges display
├── InputPane.jsx        # Raw data input panel
├── OutputPane.jsx       # X12 structure panel
├── NodeTypes.jsx        # Custom node components
└── ParticleFlow.jsx     # Particle animation system

store/
└── mapperStore.js       # Zustand state management

pages/
└── Mapper.jsx           # Main mapper component
```
