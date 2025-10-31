# Vital Signs Sensor Integration Guide

## Overview
The Hemascan dashboard includes a vital signs monitoring component that displays real-time heart rate (BPM) and blood oxygen saturation (SpO2) readings. This guide explains how to integrate actual sensor hardware.

## Current Implementation
**Production State**: The vital signs monitor connects to real AWS API Gateway endpoint for live sensor data.

**Location**: The component is located in `/components/Dashboard.tsx` in the vital signs state section.

**AWS Integration**: Connected to `https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals` for real-time sensor data.

## Production Integration

### Current AWS Integration
The application is already connected to AWS API Gateway for real-time vital signs data:
- **Endpoint**: `https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals`
- **Polling Interval**: Every 5 seconds
- **Auto-restart**: Detects sensor reconnection automatically
- **Status Management**: Handles disconnected/no_signal/normal/warning/critical states

## Integration Options

### Option 1: WebSocket Connection (Recommended for Real-time Data)
**Replace the commented simulation code with this WebSocket implementation:**

```javascript
useEffect(() => {
  // Connect to your sensor device WebSocket
  const ws = new WebSocket('ws://your-sensor-device-ip:8080');
  
  ws.onopen = () => {
    console.log('Connected to vital signs sensor');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const heartRate = data.bpm || data.heartRate;
      const spO2 = data.spo2 || data.spO2;
      
      setVitalSigns({
        heartRate: heartRate || 0,
        spO2: spO2 || 0,
        timestamp: new Date().toISOString(),
        status: determineStatus(heartRate, spO2, true) // true = sensor connected
      });
    } catch (error) {
      console.error('Invalid sensor data:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    setVitalSigns(prev => ({ 
      ...prev, 
      heartRate: 0,
      spO2: 0,
      status: 'disconnected' // Hardware/connection issue
    }));
  };

  ws.onclose = () => {
    console.log('Sensor disconnected');
    setVitalSigns(prev => ({ 
      ...prev, 
      heartRate: 0,
      spO2: 0,
      status: 'disconnected' // Hardware disconnected
    }));
  };

  return () => {
    ws.close();
  };
}, []);

// Helper function to determine status based on medical thresholds
const determineStatus = (heartRate, spO2, sensorConnected = true) => {
  // Sensor hardware not detected
  if (!sensorConnected) return 'disconnected';
  
  // Sensor connected but no valid readings (no patient detected)
  if (!heartRate || !spO2 || heartRate === 0 || spO2 === 0) return 'no_signal';
  
  // Valid readings - determine medical status
  if (heartRate < 50 || heartRate > 120 || spO2 < 90) return 'critical';
  if (heartRate < 60 || heartRate > 100 || spO2 < 95) return 'warning';
  return 'normal';
};
```

### Option 2: HTTP Polling
**Replace the commented simulation code with this HTTP polling implementation:**

```javascript
useEffect(() => {
  const interval = setInterval(async () => {
    try {
      const response = await fetch('/api/vital-signs', {
        headers: {
          'Authorization': `Bearer ${authToken}`, // if using auth
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch vital signs');
      
      const data = await response.json();
      const heartRate = data.heartRate || data.bpm;
      const spO2 = data.spO2 || data.spo2;
      
      setVitalSigns({
        heartRate: heartRate || 0,
        spO2: spO2 || 0,
        timestamp: new Date().toISOString(),
        status: data.status || determineStatus(heartRate, spO2, true) // true = sensor connected
      });
    } catch (error) {
      console.error('Failed to fetch vital signs:', error);
      setVitalSigns(prev => ({ 
        ...prev, 
        heartRate: 0,
        spO2: 0,
        status: 'disconnected' // API/network connection failed
      }));
    }
  }, 1000); // Update every second

  return () => clearInterval(interval);
}, []);
```

### Option 3: Serial Port (USB Connection)
For direct USB sensor connection, you'll need a backend service to handle serial communication:

```javascript
// Backend service example (Node.js)
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const port = new SerialPort({
  path: '/dev/ttyUSB0', // or COM port on Windows
  baudRate: 9600
});

const parser = new ReadlineParser();
port.pipe(parser);

parser.on('data', (data) => {
  try {
    const readings = JSON.parse(data);
    // Broadcast to WebSocket clients or store in database
    broadcastVitalSigns(readings);
  } catch (error) {
    console.error('Invalid sensor data:', error);
  }
});
```

## Vital Signs States

The system handles three different states to provide clear feedback to medical staff:

### 1. **No Signal State** (`no_signal`) 
- **When**: No sensor connection OR no finger detected on sensor
- **Display**: Heart Rate "--", SpO2 "--"
- **Status**: "No Signal Detected" (Orange indicator)  
- **Message**: "No signal detected - Connect sensor or place finger on sensor"
- **Trigger**: Sensor not connected, API unavailable, or no finger detected on sensor

### 2. **Normal State** (`normal`)
- **When**: Valid readings within normal ranges
- **Display**: Actual heart rate and SpO2 values
- **Status**: "Normal" (Green indicator)
- **Message**: Last updated timestamp
- **Ranges**: Heart Rate 60-100 BPM, SpO2 ≥95%

### 3. **Warning/Critical States** (`warning`/`critical`)
- **When**: Valid readings outside normal ranges
- **Display**: Actual heart rate and SpO2 values  
- **Status**: "Warning" (Yellow) or "Critical" (Red)
- **Message**: Last updated timestamp
- **Warning**: Heart Rate 50-59 or 101-120 BPM, SpO2 90-94%
- **Critical**: Heart Rate <50 or >120 BPM, SpO2 <90%

## Sensor Hardware Requirements

### Compatible Sensors
- **Pulse Oximeters**: Must output both heart rate (BPM) and SpO2 readings
- **Heart Rate Monitors**: Can be used in combination with dedicated SpO2 sensors
- **Multi-parameter Monitors**: Hospital-grade equipment with serial/network output

### Data Format Requirements
Sensors should provide data in JSON format:

**Valid readings (patient detected):**
```json
{
  "bpm": 72,
  "spo2": 98.5,
  "timestamp": "2025-01-01T12:00:00Z",
  "quality": "good" // optional: signal quality indicator
}
```

**No signal detected (no connection or no finger):**
```json
{
  "bpm": 0,        // or null
  "spo2": 0,       // or null  
  "timestamp": "2025-01-01T12:00:00Z",
  "quality": "no_signal"
}
```

**Connection status handling:**
- **No response** from sensor = `no_signal` state
- **Response with 0/null values** = `no_signal` state  
- **Response with valid values** = `normal`/`warning`/`critical` based on ranges

### Communication Protocols
- **USB/Serial**: Direct connection via USB-to-serial adapter
- **Bluetooth**: For wireless sensors (requires pairing and BLE implementation)
- **WiFi/Ethernet**: Network-connected sensors (most reliable for hospital use)
- **Proprietary protocols**: May require manufacturer-specific drivers

## Medical Thresholds & Status Determination

The system uses these medical reference ranges to determine patient status:

### Heart Rate (BPM)
- **Normal**: 60-100 BPM
- **Warning**: <60 or >100 BPM
- **Critical**: <50 or >120 BPM

### SpO2 (Blood Oxygen Saturation)
- **Normal**: ≥95%
- **Warning**: 90-94%
- **Critical**: <90%

### Status Function
```javascript
const determineStatus = (heartRate, spO2) => {
  if (heartRate < 50 || heartRate > 120 || spO2 < 90) {
    return 'critical';
  }
  if (heartRate < 60 || heartRate > 100 || spO2 < 95) {
    return 'warning';
  }
  return 'normal';
};
```

## Backend API Endpoints

If using HTTP polling, implement these endpoints:

### GET /api/vital-signs
Returns current vital signs reading
```json
{
  "heartRate": 72,
  "spO2": 98.5,
  "timestamp": "2025-01-01T12:00:00Z",
  "status": "normal"
}
```

### POST /api/vital-signs/calibrate
Calibrates sensor (if supported)
```json
{
  "sensorId": "pulse-ox-001",
  "calibrationType": "zero" // or "span"
}
```

## Security Considerations

### Data Protection
- All vital signs data should be transmitted over encrypted connections (HTTPS/WSS)
- Implement authentication for sensor endpoints
- Log all vital signs readings for audit purposes
- Ensure HIPAA compliance for patient data

### Device Authentication
- Use device certificates for sensor authentication
- Implement device registration/whitelisting
- Monitor for unauthorized devices

## Troubleshooting

### Common Issues
1. **Sensor Disconnection**: Implement reconnection logic with exponential backoff
2. **Invalid Readings**: Validate data ranges before updating UI
3. **Network Latency**: Use WebSocket heartbeat to detect connection issues
4. **Signal Quality**: Display warnings for poor sensor contact

### Error Handling
```javascript
const handleSensorError = (error) => {
  console.error('Sensor error:', error);
  
  // Update UI to show disconnected status
  setVitalSigns(prev => ({ 
    ...prev, 
    status: 'disconnected' 
  }));
  
  // Attempt reconnection after delay
  setTimeout(() => {
    // Reconnection logic here
  }, 5000);
};
```

## Testing

### Production Testing
The application now uses real AWS API Gateway integration:
- Live sensor data from ESP32 device
- Real-time status updates based on actual readings
- Automatic reconnection handling
- Production-grade error handling

### Validation Testing
- Monitor AWS API Gateway logs
- Verify sensor data accuracy
- Test reconnection scenarios
- Validate data logging and compliance

## Regulatory Compliance

### Medical Device Regulations
- Ensure sensors are FDA-approved for medical use
- Maintain calibration records
- Implement quality control procedures
- Document all integrations for regulatory audit

### Hospital IT Requirements
- Network security compliance
- Device management integration
- Data backup and recovery
- Staff training protocols

## Step-by-Step Integration Instructions

### Current Production Setup

The application is already configured with AWS API Gateway integration:

1. **AWS API Gateway Endpoint**: `https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals`
2. **Polling Strategy**: Smart polling every 5 seconds with auto-restart
3. **Status Management**: Automatic status detection based on sensor data
4. **Error Handling**: Graceful handling of disconnections and API errors

### Monitoring Your Integration

The UI automatically displays:
- **Real sensor values** when ESP32 device is connected and providing data
- **"--" values** when no signal is detected (no connection or no finger)
- **Color-coded status indicators**: Green (normal), Yellow (warning), Red (critical), Orange (no signal)
- **Automatic reconnection** when sensor becomes available again

## Production Deployment

### Infrastructure Requirements
- Dedicated network for medical devices
- Redundant connections for critical monitoring
- Central monitoring station for alerts
- Integration with hospital alarm systems

### Monitoring & Alerts
- Real-time alerts for critical values
- System health monitoring
- Automatic sensor diagnostics
- Staff notification systems