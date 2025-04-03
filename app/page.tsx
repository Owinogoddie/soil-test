"use client";
import { useState, useEffect, useRef } from "react";

// Define interfaces for our types
interface NPKReadings {
  N: number;
  P: number;
  K: number;
  EC?: number;
  temp?: number;
  moisture?: number;
}

// Define the serial port interface
interface SerialPortProps {
  readable: ReadableStream<Uint8Array>;
  close: () => Promise<void>;
}

export default function SoilProbePage() {
  const [port, setPort] = useState<SerialPortProps | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [dataBuffer, setDataBuffer] = useState<string>("");
  const [readings, setReadings] = useState<NPKReadings>({
    N: 0,
    P: 0,
    K: 0,
    EC: 0,
    temp: 0,
    moisture: 0,
  });
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const readerRef = useRef<any>(null);

  // Add log message to our visible log
  const addLog = (
    message: string,
    type: "info" | "success" | "error" | "warning" = "info"
  ) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] [${type}] ${message}`;
    console.log(logEntry);
    setLogMessages((prev) => [logEntry, ...prev].slice(0, 100)); // Keep last 100 logs
  };

  // Connect to the serial device
  const connectDevice = async () => {
    try {
      addLog("Requesting serial port...");

      // Use type assertion since navigator.serial is not in standard types
      const serial = (navigator as any).serial;

      if (!serial) {
        throw new Error("Web Serial API not supported in this browser");
      }

      // Request a port from the user
      const selectedPort = await serial.requestPort();
      addLog(`Port selected, attempting to open at baud rate 9600...`);

      await selectedPort.open({ baudRate: 9600 }); // Change to 96000 if needed

      setPort(selectedPort as SerialPortProps);
      setIsConnected(true);
      addLog("Connection established successfully!", "success");

      // Start reading data
      startReading(selectedPort as SerialPortProps);
    } catch (error) {
      addLog(`Connection error: ${(error as Error).message}`, "error");
      console.error("Connection error:", error);
    }
  };

  // Disconnect from the device
  const disconnectDevice = async () => {
    if (port) {
      try {
        // Stop the reader if it's active
        if (readerRef.current) {
          readerRef.current.cancel();
        }

        // Close the port
        await port.close();
        setPort(null);
        setIsConnected(false);
        addLog("Device disconnected", "info");
      } catch (error) {
        addLog(`Disconnect error: ${(error as Error).message}`, "error");
        console.error("Disconnect error:", error);
      }
    }
  };

  // Start reading data from the device
  const startReading = async (selectedPort: SerialPortProps) => {
    try {
      addLog("Beginning to read data from device...");

      const reader = (selectedPort.readable as any).getReader();
      readerRef.current = reader;

      // Read loop
      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          addLog("Serial reading stopped", "warning");
          reader.releaseLock();
          break;
        }

        // Decode the incoming data
        const decoded = new TextDecoder().decode(value);
        addLog(`Raw data received: ${decoded.replace(/\n/g, "\\n")}`);

        // Process the data
        try {
          processIncomingData(decoded);
        } catch (processError) {
          addLog(
            `Error processing data: ${(processError as Error).message}`,
            "error"
          );
        }
      }
    } catch (error) {
      addLog(`Reading error: ${(error as Error).message}`, "error");
      console.error("Reading error:", error);
    } finally {
      if (readerRef.current) {
        try {
          readerRef.current.releaseLock();
        } catch (e) {
          console.error("Error releasing reader lock:", e);
        }
        readerRef.current = null;
      }
    }
  };

  // Process incoming serial data
  const processIncomingData = (newData: string) => {
    // Add to our buffer
    const updatedBuffer = dataBuffer + newData;
    setDataBuffer(updatedBuffer);

    // Look for complete lines in the buffer
    const lines = updatedBuffer.split("\n");

    // Keep the last potentially incomplete line in the buffer
    if (lines.length > 1) {
      setDataBuffer(lines[lines.length - 1]);

      // Process each complete line
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          addLog(`Processing line: ${line}`);
          tryParseNPKData(line);
        }
      }
    }
  };

  // Try to parse the data as NPK readings
  const tryParseNPKData = (line: string) => {
    try {
      // This is a placeholder - adjust to match your actual data format
      // Example parsing for format like "N:10,P:20,K:30,EC:40,temp:25,moisture:60"
      const parts = line.split(",");
      const result = { ...readings };
      let hasChanged = false;

      parts.forEach((part) => {
        const [key, valueStr] = part.split(":");
        if (key && valueStr) {
          const trimmedKey = key.trim();
          const numValue = parseFloat(valueStr);

          if (!isNaN(numValue)) {
            // Type check to ensure the key is valid for our interface
            if (
              trimmedKey === "N" ||
              trimmedKey === "P" ||
              trimmedKey === "K" ||
              trimmedKey === "EC" ||
              trimmedKey === "temp" ||
              trimmedKey === "moisture"
            ) {
              (result as any)[trimmedKey] = numValue;
              hasChanged = true;
            }
          }
        }
      });

      if (hasChanged) {
        const readingsStr = Object.entries(result)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => `${key}:${value}`)
          .join(", ");

        addLog(`New readings parsed: ${readingsStr}`, "success");
        setReadings(result);
      }
    } catch (error) {
      addLog(
        `Parse error on line: ${line} - ${(error as Error).message}`,
        "error"
      );
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (port) {
        disconnectDevice();
      }
    };
  }, []); // Empty dependency array to run only on unmount

  // Add this function to your component
  const checkAvailableDevices = async () => {
    try {
      addLog("Checking for serial devices...");

      // Use type assertion since navigator.serial is not in standard types
      const serial = (navigator as any).serial;

      if (!serial) {
        addLog("Web Serial API not supported in this browser", "error");
        return;
      }

      // Try to get already paired ports
      const ports = await serial.getPorts();
      console.log(ports);
      addLog(`Found ${ports} already paired ports`, "info");

      // Try to enumerate connected devices
      addLog("Please connect your device and click 'Connect Device'", "info");
      addLog("Make sure you're using Chrome or Edge on desktop", "info");
      addLog("The site must be accessed via HTTPS or localhost", "warning");

      // Check if running on localhost
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      addLog(
        `Current host: ${window.location.hostname} (${
          isLocalhost ? "localhost - OK" : "not localhost"
        })`,
        "info"
      );
      addLog(
        `Protocol: ${window.location.protocol} (${
          window.location.protocol === "https:"
            ? "HTTPS - OK"
            : window.location.protocol === "http:" && isLocalhost
            ? "HTTP on localhost - OK"
            : "not secure"
        })`,
        "info"
      );
    } catch (error) {
      addLog(`Error checking devices: ${(error as Error).message}`, "error");
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Soil NPK Testing Station</h1>

      <div className="mb-6">
        {!isConnected ? (
          <button
            onClick={connectDevice}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Connect Device
          </button>
        ) : (
          <button
            onClick={disconnectDevice}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Disconnect Device
          </button>
        )}

        <span className="ml-4">
          Status:{" "}
          {isConnected ? (
            <span className="text-green-600 font-bold">Connected</span>
          ) : (
            <span className="text-red-600 font-bold">Disconnected</span>
          )}
        </span>
      </div>

      <button
        onClick={checkAvailableDevices}
        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ml-2"
      >
        Check API Support
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Readings Display */}
        <div className="border rounded p-4 bg-gray-50">
          <h2 className="text-xl font-bold mb-3">Current Readings</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded p-3 bg-white shadow-sm">
              <h3 className="font-bold text-gray-700">Nitrogen (N)</h3>
              <p className="text-2xl font-bold text-blue-600">{readings.N}</p>
            </div>
            <div className="border rounded p-3 bg-white shadow-sm">
              <h3 className="font-bold text-gray-700">Phosphorus (P)</h3>
              <p className="text-2xl font-bold text-green-600">{readings.P}</p>
            </div>
            <div className="border rounded p-3 bg-white shadow-sm">
              <h3 className="font-bold text-gray-700">Potassium (K)</h3>
              <p className="text-2xl font-bold text-purple-600">{readings.K}</p>
            </div>
            <div className="border rounded p-3 bg-white shadow-sm">
              <h3 className="font-bold text-gray-700">EC</h3>
              <p className="text-2xl font-bold text-yellow-600">
                {readings.EC}
              </p>
            </div>
            <div className="border rounded p-3 bg-white shadow-sm">
              <h3 className="font-bold text-gray-700">Temperature</h3>
              <p className="text-2xl font-bold text-red-600">
                {readings.temp}°C
              </p>
            </div>
            <div className="border rounded p-3 bg-white shadow-sm">
              <h3 className="font-bold text-gray-700">Moisture</h3>
              <p className="text-2xl font-bold text-cyan-600">
                {readings.moisture}%
              </p>
            </div>
          </div>
        </div>

        {/* Debugging Info */}
        <div className="border rounded p-4 bg-gray-50">
          <h2 className="text-xl font-bold mb-3">Debug Information</h2>
          <div className="mb-3">
            <h3 className="font-bold text-gray-700">Current Buffer</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
              {dataBuffer || "(empty)"}
            </pre>
          </div>
        </div>
      </div>

      {/* Log Messages */}
      <div className="mt-6 border rounded p-4 bg-gray-50">
        <h2 className="text-xl font-bold mb-3">Communication Log</h2>
        <div className="bg-black text-green-400 p-3 rounded h-64 overflow-y-auto font-mono text-sm">
          {logMessages.length > 0 ? (
            logMessages.map((msg, i) => <div key={i}>{msg}</div>)
          ) : (
            <div className="text-gray-400">
              No logs yet. Connect your device to begin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
