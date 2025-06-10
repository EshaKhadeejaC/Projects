# Face Recognition Attendance System

Automated attendance tracking with face recognition and mask detection using webcam.

## Installation

```bash
pip install opencv-python numpy keras insightface pandas tensorflow
```

## File Structure

```
project/
├── attendance_system.py
├── mask_detector.h5
├── haarcascade/
│   └── haarcascade_frontalface_default.xml
├── Image/
│   ├── Person1/
│   │   └── *.jpg
│   └── Person2/
│       └── *.jpg
└── Attendance.csv
```

## Usage

```bash
python attendance_system.py
```

Press `q` to quit.

## Configuration

```python
ARC_THRESH = 0.40      # Face recognition threshold
MASK_THRESH = 0.60     # Mask detection threshold
LOG_INTERVAL = 5       # Seconds between logs
```

## Features

- Real-time face recognition
- Mask detection (Worn/Not Worn/Incorrect)
- Automatic attendance logging
- Unknown face handling
- CSV export

## Output

**Attendance.csv**
```csv
Sl No,Date,Name,Mask Status
1,2025-06-10,John Doe,Mask Worn
2,2025-06-10,Jane Smith,No Mask
```

**Unknown faces saved to:**
```
Image/Unknown X/Unknown X_YYYYMMDD_HHMMSS.jpg
```

## Requirements

- Webcam
- Python 3.7+
- Pre-trained mask detection model
- Face images in Image/ directory
