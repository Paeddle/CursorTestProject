// CSV Service for reading tracking data from CSV file
import Papa from 'papaparse'

export interface TrackingInfo {
  id: string
  tracking_number: string
  slug: string
  tag: string
  title?: string
  order_id?: string
  po_number?: string
  destination_city?: string
  destination_state?: string
  last_updated_at?: string
  estimated_delivery?: string
  checkpoint_message?: string
  checkpoint_location?: string
  checkpoint_date?: string
  recipient_name?: string
  from_company?: string
  [key: string]: any // Allow additional fields from second CSV
}

export interface POItem {
  po_number: string
  item_name: string
  part_number: string
  description: string
  color: string
  quantity: string | number
}

class CSVService {
  private csvPath: string
  private additionalCsvPath: string
  private poItemsCsvPath: string

  constructor() {
    // CSV files should be in the public folder
    this.csvPath = '/TestCSVFile.csv'
    this.additionalCsvPath = '/AdditionalOrderInfo.csv'
    this.poItemsCsvPath = '/mock_po_items_100.csv'
  }

  private async loadCSVFile(path: string): Promise<any[]> {
    const timestamp = new Date().getTime()
    const response = await fetch(`${path}?t=${timestamp}`, {
      cache: 'no-store'
    })
    
    if (!response.ok) {
      // If additional CSV doesn't exist, return empty array
      if (path === this.additionalCsvPath) {
        return []
      }
      throw new Error(`Failed to load CSV: ${response.statusText}`)
    }

    const csvText = await response.text()
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => {
          return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '')
        },
        complete: (results) => {
          resolve(results.data || [])
        },
        error: (error: any) => {
          reject(error)
        }
      })
    })
  }

  async loadTrackings(): Promise<TrackingInfo[]> {
    try {
      // Load both CSV files
      const [ordersData, additionalData] = await Promise.all([
        this.loadCSVFile(this.csvPath),
        this.loadCSVFile(this.additionalCsvPath).catch(() => []) // Silently fail if additional CSV doesn't exist
      ])

      // Create a map of additional data by order_id or tracking_number, and also keep array for index matching
      const additionalDataMap = new Map<string, any>()
      additionalData.forEach((row: any) => {
        const key = row.order_number || row.order_id || row.tracking_number || row.po_number || ''
        if (key) {
          additionalDataMap.set(key.toLowerCase(), row)
        }
      })

      // Parse orders and merge with additional data
      const trackings: TrackingInfo[] = ordersData.map((row: any, index: number) => {
        const trackingNumber = row.tracking_number || ''
        const estimatedDelivery = row.estimated_delivery || ''
        const shipDate = row.ship_date || row.email_date || ''
        const orderId = row.order_number || ''
        
        // Determine status based on estimated delivery date
        const tag = this.determineStatus(estimatedDelivery)
        
        // Parse recipient/site name - might contain location info
        const recipientName = row.recipient_site_name || row.recipient || ''
        const destinationParts = this.parseDestination(recipientName)
        
        // Find matching additional data by order_id, tracking_number, PO number, or row index (fallback)
        const additionalInfo = additionalDataMap.get(orderId.toLowerCase()) || 
                               additionalDataMap.get(trackingNumber.toLowerCase()) ||
                               additionalDataMap.get((row.po_number || '').toLowerCase()) ||
                               (additionalData[index] || {}) // Fallback to row index matching
        
        // Merge additional fields (exclude fields that are already in base tracking)
        const baseTracking: any = {
          id: orderId || row.po_number || `tracking-${index}`,
          tracking_number: trackingNumber,
          slug: (row.carrier || '').toLowerCase(),
          tag: tag,
          title: row.subject || `${row.from_company || ''} Order ${orderId || ''}`.trim(),
          order_id: orderId,
          po_number: row.po_number || '',
          destination_city: destinationParts.city || '',
          destination_state: destinationParts.state || '',
          last_updated_at: shipDate || row.email_date || '',
          estimated_delivery: estimatedDelivery,
          checkpoint_message: row.body_preview || row.subject || '',
          checkpoint_location: recipientName,
          checkpoint_date: estimatedDelivery || shipDate || row.email_date || '',
          recipient_name: recipientName,
          from_company: row.from_company || '',
        }

        // Add all additional fields
        Object.keys(additionalInfo).forEach(key => {
          if (!baseTracking.hasOwnProperty(key) && additionalInfo[key]) {
            baseTracking[key] = additionalInfo[key]
          }
        })

        return baseTracking
      }).filter((tracking: TrackingInfo) => 
        tracking.tracking_number && tracking.tracking_number.trim() !== ''
      )

      return trackings
    } catch (error: any) {
      throw new Error(`Failed to load CSV file: ${error.message}`)
    }
  }

  private determineStatus(estimatedDelivery: string): string {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (!estimatedDelivery) {
      return 'in_transit'
    }
    
    try {
      const trimmed = estimatedDelivery.trim()
      let estDate: Date

      const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch
        estDate = new Date(Number(year), Number(month) - 1, Number(day))
      } else {
        estDate = new Date(trimmed)
      }

      estDate.setHours(0, 0, 0, 0)
      
      if (isNaN(estDate.getTime())) {
        return 'in_transit'
      }
      
      // If estimated delivery is in the past, likely delivered
      if (estDate < today) {
        return 'delivered'
      }
      // If estimated delivery is today, might be out for delivery
      if (estDate.getTime() === today.getTime()) {
        return 'out_for_delivery'
      }
      // If estimated delivery is in the future, in transit
      return 'in_transit'
    } catch {
      return 'in_transit'
    }
  }

  private parseDestination(recipientName: string): { city?: string; state?: string } {
    if (!recipientName) {
      return {}
    }
    
    // Try to extract city and state from recipient name
    // Format might be "Site Name - City, ST" or "City, ST" or just site name
    const parts = recipientName.split(/[-,]/).map(p => p.trim())
    
    // Look for state abbreviations (2-letter codes)
    const statePattern = /\b([A-Z]{2})\b/
    const stateMatch = recipientName.match(statePattern)
    
    if (stateMatch && parts.length >= 2) {
      const state = stateMatch[1]
      const city = parts.find(p => !p.match(/^[A-Z]{2}$/) && p.length > 0) || ''
      return { city, state }
    }
    
    return {}
  }

  async loadPOItems(): Promise<Map<string, POItem[]>> {
    try {
      const itemsData = await this.loadCSVFile(this.poItemsCsvPath).catch(() => [])
      
      // Group items by PO number
      const itemsMap = new Map<string, POItem[]>()
      
      itemsData.forEach((row: any) => {
        const poNumber = row.po_number || ''
        if (!poNumber) return

        const item: POItem = {
          po_number: poNumber,
          item_name: row.item_name || '',
          part_number: row.part_number || '',
          description: row.description || '',
          color: row.color || '',
          quantity: row.quantity || 0,
        }

        const normalizedPO = poNumber.toLowerCase()
        if (!itemsMap.has(normalizedPO)) {
          itemsMap.set(normalizedPO, [])
        }
        itemsMap.get(normalizedPO)!.push(item)
      })

      return itemsMap
    } catch (error: any) {
      console.warn('Failed to load PO items CSV:', error.message)
      return new Map()
    }
  }

}

export const csvService = new CSVService()
