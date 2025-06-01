import os
import cv2
import numpy as np
import keras
import insightface
import pandas as pd
from datetime import datetime

DIR = "Image"      
ARC_THRESH = 0.40
MASK_THRESH = 0.60         
ATTENDANCE_FILE = "Attendance.csv"
UNKNOWN_DIR = "Image"  

mask_model = keras.models.load_model("mask_detector.h5")
class_mapping = {
    0: "Mask Worn",
    1: "No Mask",
    2: "Mask Worn Incorrectly"
} 
color_mapping = {
    0: (0,255,0),
    1: (0,0,255),
    2: (0,165,255)
}

face_cascade = cv2.CascadeClassifier('haarcascade/haarcascade_frontalface_default.xml')

app = insightface.app.FaceAnalysis(providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640,640))

known_embeddings, known_names = [], []
unknown_embeddings, unknown_names = [], []  

for name in os.listdir(DIR):
    person_dir = os.path.join(DIR, name)
    if not os.path.isdir(person_dir):
        continue
    for fn in os.listdir(person_dir):
        img = cv2.imread(os.path.join(person_dir, fn))
        if img is None:
            continue
        faces = app.get(img)  
        if not faces:
            continue
        
        if name.startswith('Unknown '):
            unknown_embeddings.append(faces[0].embedding)
            unknown_names.append(name)
        else:
            known_embeddings.append(faces[0].embedding)
            known_names.append(name)
        
print(f"Loaded embeddings for known: {set(known_names)}")
print(f"Loaded embeddings for unknown: {set(unknown_names)}")


def init_attendance_df():
    if os.path.exists(ATTENDANCE_FILE):
        try:
            df = pd.read_csv(ATTENDANCE_FILE)
            # Ensure all required columns exist
            required_columns = ['Sl No', 'Date', 'Name', 'Mask Status']
            for col in required_columns:
                if col not in df.columns:
                    df[col] = None
            return df
        except (pd.errors.EmptyDataError, FileNotFoundError):
            pass
    

    df = pd.DataFrame(columns=['Sl No', 'Date', 'Name', 'Mask Status'])
    df.to_csv(ATTENDANCE_FILE, index=False)
    return df

def get_next_unknown_number():

    unknown_dirs = [d for d in os.listdir(UNKNOWN_DIR) if d.startswith('Unknown ') and os.path.isdir(os.path.join(UNKNOWN_DIR, d))]
    if not unknown_dirs:
        return 1
    
    numbers = []
    for d in unknown_dirs:
        try:
            num = int(d.split(' ')[1])
            numbers.append(num)
        except (IndexError, ValueError):
            continue
    
    return max(numbers) + 1 if numbers else 1

def save_unknown_face(frame, face_bbox, embedding):
    
    if unknown_embeddings:
        unknown_sims = [cosine_sim(embedding, ue) for ue in unknown_embeddings]
        best_unknown_idx = int(np.argmax(unknown_sims))
        best_unknown_score = unknown_sims[best_unknown_idx]
        
        if best_unknown_score >= ARC_THRESH:

            return unknown_names[best_unknown_idx]
    
    unknown_num = get_next_unknown_number()
    unknown_name = f"Unknown {unknown_num}"
    unknown_path = os.path.join(UNKNOWN_DIR, unknown_name)
    
    os.makedirs(unknown_path, exist_ok=True)
    
    x1, y1, x2, y2 = face_bbox.astype(int)
    face_img = frame[y1:y2, x1:x2]
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    img_filename = f"{unknown_name}_{timestamp}.jpg"
    img_path = os.path.join(unknown_path, img_filename)
    cv2.imwrite(img_path, face_img)
    
    unknown_embeddings.append(embedding)
    unknown_names.append(unknown_name)
    
    print(f"New unknown person saved as: {unknown_name}")
    return unknown_name

def check_attendance_exists(df, name, date):

    if df.empty:
        return False
    
    existing = df[(df['Name'] == name) & (df['Date'] == date)]
    return not existing.empty

def log_attendance(df, name, mask_status):

    current_date = datetime.now().strftime("%Y-%m-%d")
    
    if check_attendance_exists(df, name, current_date):
        print(f"Attendance already logged for {name} on {current_date}")
        return df, False
    
    sl_no = len(df) + 1
    
    new_row = pd.DataFrame({
        'Sl No': [sl_no],
        'Date': [current_date],
        'Name': [name],
        'Mask Status': [mask_status]
    })
    
    df = pd.concat([df, new_row], ignore_index=True)
    
    df.to_csv(ATTENDANCE_FILE, index=False)
    
    print(f"Attendance logged: {name} - {mask_status} on {current_date}")
    return df, True

def get_attendance_stats(df):
    """Get attendance statistics using pandas"""
    if df.empty:
        return {}
    
    current_date = datetime.now().strftime("%Y-%m-%d")
    today_attendance = df[df['Date'] == current_date]
    
    return {
        'total_records': len(df),
        'today_count': len(today_attendance),
        'unique_students': df['Name'].nunique(),
        'mask_compliance': df['Mask Status'].value_counts().to_dict() if not df.empty else {}
    }

def cosine_sim(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def get_mask_prediction_from_haar(frame):

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    haar_faces = face_cascade.detectMultiScale(
        gray, 
        scaleFactor=1.1,
        minNeighbors=5,
    )
    
    if len(haar_faces) == 0:
        return None, None, None
    
    x, y, w, h = haar_faces[0]  

    roi = frame[y:y+h, x:x+w]
    if roi.size == 0:
        return None, None, None
    
    predictions = []
    for _ in range(3):
        mask_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        mask_roi = cv2.resize(mask_roi, (224,224)).astype("float32") / 255.0
        pred = mask_model.predict(np.expand_dims(mask_roi, axis=0), verbose=0)[0]
        predictions.append(pred)
    
    avg_pred = np.mean(predictions, axis=0)
    cid = int(np.argmax(avg_pred))
    conf = float(avg_pred[cid])
    
    if conf < MASK_THRESH:
        return None, None, None
    
    mask_label = class_mapping[cid]
    mask_color = color_mapping[cid]
    
    return mask_label, conf, mask_color

attendance_df = init_attendance_df()


last_logged_student = None
last_log_time = None
LOG_INTERVAL = 5  
attendance_logged_today = set()  

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    raise RuntimeError("Webcam not accessible")

print("Face detection with automatic attendance tracking started. Press 'q' to quit.")

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    mask_result = get_mask_prediction_from_haar(frame)
    
    insightface_faces = app.get(frame)
    
    if mask_result[0] is not None and len(insightface_faces) > 0:
        mask_label, mask_conf, mask_color = mask_result
        
        face = insightface_faces[0]  
        
        x1, y1, x2, y2 = face.bbox.astype(int)
        emb = face.embedding
        
        sims = [cosine_sim(emb, ke) for ke in known_embeddings]
        if sims:
            best_idx = int(np.argmax(sims))
            best_score = sims[best_idx]
            if best_score >= ARC_THRESH:
                student_name = known_names[best_idx]
                name_label = f"{student_name}:{best_score:.2f}"
                name_color = (0,255,0)
            else:

                student_name = save_unknown_face(frame, face.bbox, emb)
                name_label = f"{student_name}:{best_score:.2f}"
                name_color = (0,0,255)
        else:
            student_name = save_unknown_face(frame, face.bbox, emb)
            name_label = f"{student_name}:NoDB"
            name_color = (0,0,255)

        current_time = datetime.now()
        current_date = current_time.strftime("%Y-%m-%d")
        
        attendance_key = f"{student_name}_{current_date}"
        
        should_log = False

        if attendance_key not in attendance_logged_today:
            should_log = True

        elif (last_logged_student != student_name or 
              last_log_time is None or 
              (current_time - last_log_time).seconds >= LOG_INTERVAL):
            should_log = True
        
        if should_log:
            attendance_df, logged = log_attendance(attendance_df, student_name, mask_label)
            if logged:
                last_logged_student = student_name
                last_log_time = current_time
                attendance_logged_today.add(attendance_key)
                
                attendance_status = "ATTENDANCE LOGGED"
                attendance_color = (0, 255, 0)
            else:
                attendance_status = "ALREADY LOGGED TODAY"
                attendance_color = (0, 255, 255)
        else:
            attendance_status = "PROCESSING..."
            attendance_color = (255, 255, 0)

        cv2.rectangle(frame, (x1, y1), (x2, y2), mask_color, 2)
        cv2.putText(frame,
                    f"{mask_label} ({mask_conf:.2f})",
                    (x1, y1 - 50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    mask_color,
                    2)
        cv2.putText(frame,
                    name_label,
                    (x1, y1 - 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    name_color,
                    2)
        cv2.putText(frame,
                    attendance_status,
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    attendance_color,
                    2)
        
        # Display status on top of frame
        cv2.putText(frame,
                    f"Auto Attendance: {len(attendance_logged_today)} logged today",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2)

    cv2.imshow("MAsk Detection System", frame)
    
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

final_stats = get_attendance_stats(attendance_df)
print(f"\nFinal session summary:")
print(f"Total attendance records: {final_stats.get('total_records', 0)}")
print(f"Attendance data saved to {ATTENDANCE_FILE}")

