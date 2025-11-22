import { useState, useEffect } from 'react'
import './App.css'
import { csvService, TrackingInfo, POItem } from './services/csvService'
import Sidebar from './components/Sidebar'
import { getMetabaseEmbedUrl } from './services/metabase'

type SortColumn = 'tracking_number' | 'order_id' | 'po_number' | 'from_company' | 'recipient_name' | 'carrier' | 'status' | 'ship_date' | 'estimated_delivery'
type SortDirection = 'asc' | 'desc' | null

function App() {
  const [activePage, setActivePage] = useState('tracking')
  const [trackings, setTrackings] = useState<TrackingInfo[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [selectedTracking, setSelectedTracking] = useState<TrackingInfo | null>(null)
  const [poItemsMap, setPoItemsMap] = useState<Map<string, POItem[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'orders' | 'items'>('orders')
  const [itemSearchColumn, setItemSearchColumn] = useState<'all' | 'item_name' | 'part_number' | 'description' | 'color' | 'quantity' | 'po_number'>('all')
  const [metabaseUrl, setMetabaseUrl] = useState<string | null>(null)
  const [metabaseLoading, setMetabaseLoading] = useState(false)

  useEffect(() => {
    loadTrackings()
    loadPOItems()
  }, [])

  // Load Metabase embed URL when analytics page is active
  useEffect(() => {
    if (activePage === 'analytics') {
      loadMetabaseUrl()
      
      // Refresh the URL every 9 minutes (before 10 minute expiration)
      const refreshInterval = setInterval(() => {
        loadMetabaseUrl()
      }, 9 * 60 * 1000) // 9 minutes
      
      return () => clearInterval(refreshInterval)
    }
  }, [activePage])

  const loadMetabaseUrl = async () => {
    setMetabaseLoading(true)
    try {
      const url = await getMetabaseEmbedUrl()
      setMetabaseUrl(url)
    } catch (err: any) {
      console.error('Error loading Metabase URL:', err)
      setMetabaseUrl(null)
    } finally {
      setMetabaseLoading(false)
    }
  }

  // Clear status filter when switching to order history (since all are delivered)
  // Also clear when switching to items view
  useEffect(() => {
    if (activePage === 'order-history' || viewMode === 'items') {
      setStatusFilter([])
    }
  }, [activePage, viewMode])

  const loadPOItems = async () => {
    try {
      const itemsMap = await csvService.loadPOItems()
      setPoItemsMap(itemsMap)
    } catch (err: any) {
      console.error('Error loading PO items:', err)
    }
  }

  const loadTrackings = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await csvService.loadTrackings()
      setTrackings(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load tracking data from CSV')
      console.error('Error loading trackings:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (tag: string) => {
    switch (tag?.toLowerCase()) {
      case 'delivered': return '#10b981'
      case 'in_transit': return '#3b82f6'
      case 'pending': return '#f59e0b'
      case 'exception': return '#ef4444'
      case 'out_for_delivery': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  const getStatusLabel = (tag: string) => {
    return tag?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'

    const trimmed = dateString.trim()
    if (!trimmed) return 'N/A'

    // Handle date-only strings (e.g., 2025-11-13) without timezone shifts
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      const date = new Date(Number(year), Number(month) - 1, Number(day))
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }

    try {
      const date = new Date(trimmed)
      if (isNaN(date.getTime())) return dateString
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  const getTrackingUrl = (trackingNumber: string, carrier: string): string | null => {
    if (!trackingNumber || !carrier) return null

    const normalizedCarrier = carrier.toLowerCase().trim()
    const encodedTracking = encodeURIComponent(trackingNumber)

    switch (normalizedCarrier) {
      case 'ups':
        return `https://www.ups.com/track?tracknum=${encodedTracking}`
      case 'fedex':
      case 'fedex express':
      case 'fedex ground':
        return `https://www.fedex.com/fedextrack/?trknbr=${encodedTracking}`
      case 'usps':
        return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodedTracking}`
      case 'dhl':
        return `https://www.dhl.com/en/express/tracking.html?AWB=${encodedTracking}`
      case 'amazon':
      case 'amazon logistics':
        return `https://www.amazon.com/progress-tracker/package/${encodedTracking}`
      case 'ontrac':
        return `https://www.ontrac.com/tracking-results?tracking_number=${encodedTracking}`
      case 'lasership':
        return `https://lasership.com/track/${encodedTracking}`
      default:
        // Try generic tracking search
        return `https://www.google.com/search?q=${encodedTracking}+tracking`
    }
  }

  // Filter trackings based on search term and status filter
  const filterTrackings = (trackings: TrackingInfo[], search: string, statuses: string[]): TrackingInfo[] => {
    let filtered = trackings

    // Apply status filter (multiple statuses)
    if (statuses.length > 0) {
      filtered = filtered.filter(tracking => statuses.includes(tracking.tag))
    }

    // Apply search filter - search across ALL fields including additional CSV fields
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      filtered = filtered.filter(tracking => {
        // Get all values from the tracking object
        const allFieldValues: (string | number | undefined)[] = []
        
        // Add all standard fields
        allFieldValues.push(
          tracking.tracking_number,
          tracking.order_id,
          tracking.po_number,
          tracking.from_company,
          tracking.recipient_name,
          tracking.destination_city,
          tracking.destination_state,
          tracking.slug,
          tracking.tag,
          tracking.title,
          tracking.checkpoint_message,
          tracking.checkpoint_location,
          formatDate(tracking.last_updated_at),
          formatDate(tracking.estimated_delivery),
          formatDate(tracking.checkpoint_date),
        )

        // Add all additional fields from the second CSV dynamically
        Object.keys(tracking).forEach(key => {
          const value = tracking[key]
          // Skip internal/system fields and already included fields
          if (key !== 'id' && 
              !['id', 'tracking_number', 'order_id', 'po_number', 'from_company', 
                'recipient_name', 'destination_city', 'destination_state', 'slug', 
                'tag', 'title', 'checkpoint_message', 'checkpoint_location', 
                'last_updated_at', 'estimated_delivery', 'checkpoint_date'].includes(key)) {
            if (value !== null && value !== undefined && value !== '') {
              allFieldValues.push(value)
            }
          }
        })

        // Convert all values to strings and search
        const searchableFields = allFieldValues
          .filter(Boolean)
          .map(field => String(field).toLowerCase())

        return searchableFields.some(field => field.includes(searchLower))
      })
    }

    return filtered
  }

  // Sort trackings
  const sortTrackings = (trackings: TrackingInfo[], column: SortColumn | null, direction: SortDirection): TrackingInfo[] => {
    if (!column || !direction) {
      return trackings
    }

    return [...trackings].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (column) {
        case 'tracking_number':
          aValue = a.tracking_number || ''
          bValue = b.tracking_number || ''
          break
        case 'order_id':
          aValue = a.order_id || ''
          bValue = b.order_id || ''
          break
        case 'po_number':
          aValue = a.po_number || ''
          bValue = b.po_number || ''
          break
        case 'from_company':
          aValue = a.from_company || ''
          bValue = b.from_company || ''
          break
        case 'recipient_name':
          aValue = a.recipient_name || ''
          bValue = b.recipient_name || ''
          break
        case 'carrier':
          aValue = a.slug || ''
          bValue = b.slug || ''
          break
        case 'status':
          aValue = a.tag || ''
          bValue = b.tag || ''
          break
        case 'ship_date':
          aValue = a.last_updated_at ? new Date(a.last_updated_at).getTime() : 0
          bValue = b.last_updated_at ? new Date(b.last_updated_at).getTime() : 0
          break
        case 'estimated_delivery':
          aValue = a.estimated_delivery ? new Date(a.estimated_delivery).getTime() : 0
          bValue = b.estimated_delivery ? new Date(b.estimated_delivery).getTime() : 0
          break
        default:
          return 0
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      } else {
        return direction === 'asc' ? aValue - bValue : bValue - aValue
      }
    })
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection(null)
      } else {
        setSortDirection('asc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status)
      } else {
        return [...prev, status]
      }
    })
  }

  // Get additional columns from the first tracking (fields that aren't standard columns)
  const getAdditionalColumns = (): string[] => {
    if (trackings.length === 0) return []
    
    const standardFields = new Set([
      'id', 'tracking_number', 'slug', 'tag', 'title', 'order_id', 'po_number',
      'destination_city', 'destination_state', 'last_updated_at', 'estimated_delivery',
      'checkpoint_message', 'checkpoint_location', 'checkpoint_date',
      'recipient_name', 'from_company'
    ])
    
    const firstTracking = trackings[0]
    return Object.keys(firstTracking)
      .filter(key => !standardFields.has(key) && firstTracking[key] !== null && firstTracking[key] !== '')
      .slice(0, 3) // Limit to 3 additional columns to keep table manageable
  }

  const additionalColumns = getAdditionalColumns()

  // Filter trackings based on active page
  let trackingsToShow = trackings
  if (activePage === 'tracking') {
    // Exclude delivered orders from tracking page
    trackingsToShow = trackings.filter(t => t.tag?.toLowerCase() !== 'delivered')
  } else if (activePage === 'order-history') {
    // Show only delivered orders in order history
    trackingsToShow = trackings.filter(t => t.tag?.toLowerCase() === 'delivered')
  }

  const filteredTrackings = filterTrackings(trackingsToShow, searchTerm, statusFilter)
  const sortedTrackings = sortTrackings(filteredTrackings, sortColumn, sortDirection)

  const formatColumnName = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
  }

  // Get all items from PO items map, optionally filtered by order status
  const getAllItems = (onlyDelivered?: boolean): POItem[] => {
    const allItems: POItem[] = []
    
    if (onlyDelivered === true) {
      // Only get items from delivered orders
      const deliveredPONumbers = new Set(
        trackings
          .filter(t => t.tag?.toLowerCase() === 'delivered' && t.po_number)
          .map(t => t.po_number!.toLowerCase())
      )
      
      poItemsMap.forEach((items, poNumber) => {
        if (deliveredPONumbers.has(poNumber.toLowerCase())) {
          allItems.push(...items)
        }
      })
    } else if (onlyDelivered === false) {
      // Get items from non-delivered orders
      const nonDeliveredPONumbers = new Set(
        trackings
          .filter(t => t.tag?.toLowerCase() !== 'delivered' && t.po_number)
          .map(t => t.po_number!.toLowerCase())
      )
      
      poItemsMap.forEach((items, poNumber) => {
        if (nonDeliveredPONumbers.has(poNumber.toLowerCase())) {
          allItems.push(...items)
        }
      })
    } else {
      // Get all items (no filter)
      poItemsMap.forEach((items) => {
        allItems.push(...items)
      })
    }
    
    return allItems
  }

  // Filter items based on search term and selected column
  const filterItems = (items: POItem[], search: string, column: typeof itemSearchColumn): POItem[] => {
    if (!search.trim()) return items
    
    const searchLower = search.toLowerCase().trim()
    return items.filter(item => {
      if (column === 'all') {
        // Search all item fields
        const searchableFields = [
          item.item_name,
          item.part_number,
          item.description,
          item.color,
          String(item.quantity),
          item.po_number
        ].filter(Boolean).map(f => String(f).toLowerCase())
        
        return searchableFields.some(field => field.includes(searchLower))
      } else {
        // Search only the selected column
        let fieldValue: string = ''
        switch (column) {
          case 'item_name':
            fieldValue = item.item_name || ''
            break
          case 'part_number':
            fieldValue = item.part_number || ''
            break
          case 'description':
            fieldValue = item.description || ''
            break
          case 'color':
            fieldValue = item.color || ''
            break
          case 'quantity':
            fieldValue = String(item.quantity || '')
            break
          case 'po_number':
            fieldValue = item.po_number || ''
            break
        }
        return fieldValue.toLowerCase().includes(searchLower)
      }
    })
  }

  // Find order by PO number
  const findOrderByPONumber = (poNumber: string): TrackingInfo | null => {
    return trackings.find(t => 
      t.po_number?.toLowerCase() === poNumber.toLowerCase()
    ) || null
  }

  // Handle item click - find and show the order
  const handleItemClick = (item: POItem) => {
    const order = findOrderByPONumber(item.po_number)
    if (order) {
      setSelectedTracking(order)
    }
  }

  // Get items based on active page
  const allItems = activePage === 'order-history' 
    ? getAllItems(true) // Only delivered orders' items
    : getAllItems(false) // Only non-delivered orders' items
  const filteredItems = filterItems(allItems, searchTerm, itemSearchColumn)

  return (
    <div className="app">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="main-content">
        <header className="header">
          <h1>
            {activePage === 'order-history' ? 'Order History' 
              : activePage === 'analytics' ? 'Analytics'
              : 'Order Tracker'}
          </h1>
          <p className="subtitle">
            {activePage === 'order-history' 
              ? 'View all delivered orders'
              : activePage === 'analytics'
              ? 'View analytics and insights'
              : 'Track all your orders from CSV data'}
          </p>
        </header>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {activePage === 'analytics' ? (
          <div className="analytics-container">
            {metabaseLoading ? (
              <div className="loading-state">
                <p>Loading Metabase visualization...</p>
              </div>
            ) : metabaseUrl ? (
              <div className="metabase-embed-wrapper">
                <iframe
                  src={metabaseUrl}
                  className="metabase-iframe"
                  title="Metabase Analytics"
                  frameBorder="0"
                  width="800"
                  height="600"
                  allowTransparency
                  allow="fullscreen"
                />
              </div>
            ) : (
              <div className="metabase-config-message">
                <p>⚠️ Metabase configuration not found</p>
                <p>Please set the following environment variables in your <code>.env</code> file:</p>
                <div className="metabase-instructions">
                  <ul>
                    <li><code>VITE_METABASE_SITE_URL</code> - Your Metabase instance URL</li>
                    <li><code>VITE_METABASE_SECRET_KEY</code> - Your Metabase embed secret key</li>
                    <li><code>VITE_METABASE_QUESTION_ID</code> - The ID of your question (number)</li>
                  </ul>
                  <p><strong>Example .env file:</strong></p>
                  <pre className="code-example">VITE_METABASE_SITE_URL=http://artichoke-penguin.pikapod.net
VITE_METABASE_SECRET_KEY=53fe21e7488ef56145dbfb9ef9ae8d0a30a804c5c388271ae467a3cecf74f995
VITE_METABASE_QUESTION_ID=41</pre>
                  <p><em>Note: The embed URL is generated dynamically with a 10-minute expiration and will auto-refresh.</em></p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {(activePage === 'tracking' || activePage === 'order-history') && (
          <div className="view-toggle-section">
            <button
              className={`view-toggle-button ${viewMode === 'orders' ? 'active' : ''}`}
              onClick={() => setViewMode('orders')}
            >
              📦 Orders
            </button>
            <button
              className={`view-toggle-button ${viewMode === 'items' ? 'active' : ''}`}
              onClick={() => setViewMode('items')}
            >
              📋 Items
            </button>
          </div>
        )}

        <div className="search-section">
          {((activePage === 'tracking' || activePage === 'order-history') && viewMode === 'items') && (
            <select
              className="search-column-select"
              value={itemSearchColumn}
              onChange={(e) => setItemSearchColumn(e.target.value as typeof itemSearchColumn)}
            >
              <option value="all">All Columns</option>
              <option value="item_name">Item Name</option>
              <option value="part_number">Part Number</option>
              <option value="description">Description</option>
              <option value="color">Color</option>
              <option value="quantity">Quantity</option>
              <option value="po_number">PO Number</option>
            </select>
          )}
          <input
            type="text"
            className="search-input"
            placeholder={
              ((activePage === 'tracking' || activePage === 'order-history') && viewMode === 'items')
                ? itemSearchColumn === 'all'
                  ? "Search all columns..."
                  : `Search by ${itemSearchColumn.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}...`
                : "Search by tracking number, order number, PO number, company, recipient, carrier, status, or any field..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search-button"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {activePage !== 'order-history' && viewMode === 'orders' && (
          <div className="status-filters">
            <button
              className={`status-filter-button ${statusFilter.length === 0 ? 'active' : ''}`}
              onClick={() => setStatusFilter([])}
            >
              All
            </button>
            <button
              className={`status-filter-button ${statusFilter.includes('in_transit') ? 'active' : ''}`}
              onClick={() => toggleStatusFilter('in_transit')}
              style={{ backgroundColor: statusFilter.includes('in_transit') ? '#3b82f6' : undefined }}
            >
              In Transit
            </button>
            <button
              className={`status-filter-button ${statusFilter.includes('out_for_delivery') ? 'active' : ''}`}
              onClick={() => toggleStatusFilter('out_for_delivery')}
              style={{ backgroundColor: statusFilter.includes('out_for_delivery') ? '#8b5cf6' : undefined }}
            >
              Out For Delivery
            </button>
          </div>
        )}

        <div className="actions-bar">
          <button 
            className="refresh-button"
            onClick={loadTrackings}
            disabled={loading}
          >
            Refresh Data
          </button>
          <span className="tracking-count">
            {((activePage === 'tracking' || activePage === 'order-history') && viewMode === 'items')
              ? `${filteredItems.length} ${filteredItems.length === 1 ? 'item' : 'items'}`
              : `${sortedTrackings.length} ${sortedTrackings.length === 1 ? 'order' : 'orders'}${(statusFilter.length > 0 || searchTerm) ? ` (of ${trackingsToShow.length} total)` : ''}`
            }
          </span>
        </div>

        <div className="trackings-container">
          {loading && trackings.length === 0 ? (
            <div className="loading-state">
              <p>Loading your orders from CSV...</p>
            </div>
          ) : ((activePage === 'tracking' || activePage === 'order-history') && viewMode === 'items') ? (
            // Items view
            filteredItems.length === 0 ? (
              <div className="empty-state">
                <p>No items match your search. Try adjusting your search term.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="trackings-table">
                  <thead>
                    <tr>
                      <th>PO Number</th>
                      <th>Item Name</th>
                      <th>Part Number</th>
                      <th>Description</th>
                      <th>Color</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, index) => {
                      const order = findOrderByPONumber(item.po_number)
                      return (
                        <tr
                          key={`${item.po_number}-${index}`}
                          onClick={() => handleItemClick(item)}
                          className="clickable-row"
                          style={{ cursor: order ? 'pointer' : 'default' }}
                          title={order ? 'Click to view order details' : 'No order found for this PO number'}
                        >
                          <td>{item.po_number}</td>
                          <td>{item.item_name || 'N/A'}</td>
                          <td>{item.part_number || 'N/A'}</td>
                          <td>{item.description || 'N/A'}</td>
                          <td>{item.color || 'N/A'}</td>
                          <td>{item.quantity || 'N/A'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : trackings.length === 0 ? (
            <div className="empty-state">
              <p>No orders found in CSV file. Make sure TestCSVFile.csv exists in the public folder.</p>
            </div>
          ) : activePage === 'order-history' && trackingsToShow.length === 0 ? (
            <div className="empty-state">
              <p>No delivered orders found.</p>
            </div>
          ) : sortedTrackings.length === 0 ? (
            <div className="empty-state">
              <p>No orders match your filters. Try adjusting your search or status filter.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="trackings-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('tracking_number')} className="sortable">
                      Tracking Number
                      {sortColumn === 'tracking_number' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('order_id')} className="sortable">
                      Order Number
                      {sortColumn === 'order_id' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('po_number')} className="sortable">
                      PO Number
                      {sortColumn === 'po_number' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('from_company')} className="sortable">
                      From Company
                      {sortColumn === 'from_company' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('carrier')} className="sortable">
                      Carrier
                      {sortColumn === 'carrier' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('status')} className="sortable">
                      Status
                      {sortColumn === 'status' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('ship_date')} className="sortable">
                      Ship Date
                      {sortColumn === 'ship_date' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th onClick={() => handleSort('estimated_delivery')} className="sortable">
                      Est. Delivery
                      {sortColumn === 'estimated_delivery' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    {additionalColumns.map(column => (
                      <th key={column} className="additional-column">
                        {formatColumnName(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTrackings.map(tracking => (
                    <tr 
                      key={tracking.id}
                      onClick={() => setSelectedTracking(tracking)}
                      className="clickable-row"
                    >
                      <td>{tracking.tracking_number}</td>
                      <td>{tracking.order_id || 'N/A'}</td>
                      <td>{tracking.po_number || 'N/A'}</td>
                      <td>{tracking.from_company || 'N/A'}</td>
                      <td>{tracking.slug ? tracking.slug.toUpperCase() : 'N/A'}</td>
                      <td>
                        <span 
                          className="status-badge-table"
                          style={{ backgroundColor: getStatusColor(tracking.tag) }}
                        >
                          {getStatusLabel(tracking.tag)}
                        </span>
                      </td>
                      <td>{tracking.last_updated_at ? formatDate(tracking.last_updated_at) : 'N/A'}</td>
                      <td>{tracking.estimated_delivery ? formatDate(tracking.estimated_delivery) : 'N/A'}</td>
                      {additionalColumns.map(column => (
                        <td key={column}>{tracking[column] || 'N/A'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}

        {selectedTracking && (
          <div className="modal-overlay" onClick={() => setSelectedTracking(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Order Details</h2>
                <button 
                  className="modal-close-button"
                  onClick={() => setSelectedTracking(null)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-section">
                  <h3>Tracking Information</h3>
                  <div className="modal-grid">
                    <div className="modal-field">
                      <strong>Tracking Number:</strong>
                      {getTrackingUrl(selectedTracking.tracking_number, selectedTracking.slug) ? (
                        <a 
                          href={getTrackingUrl(selectedTracking.tracking_number, selectedTracking.slug)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tracking-link"
                        >
                          {selectedTracking.tracking_number}
                        </a>
                      ) : (
                        <span>{selectedTracking.tracking_number}</span>
                      )}
                    </div>
                    <div className="modal-field">
                      <strong>Order Number:</strong>
                      <span>{selectedTracking.order_id || 'N/A'}</span>
                    </div>
                    <div className="modal-field">
                      <strong>PO Number:</strong>
                      <span>{selectedTracking.po_number || 'N/A'}</span>
                    </div>
                    <div className="modal-field">
                      <strong>Carrier:</strong>
                      <span>{selectedTracking.slug ? selectedTracking.slug.toUpperCase() : 'N/A'}</span>
                    </div>
                    <div className="modal-field">
                      <strong>Status:</strong>
                      <span 
                        className="status-badge-modal"
                        style={{ backgroundColor: getStatusColor(selectedTracking.tag) }}
                      >
                        {getStatusLabel(selectedTracking.tag)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="modal-section">
                  <h3>Company & Recipient</h3>
                  <div className="modal-grid">
                    <div className="modal-field">
                      <strong>From Company:</strong>
                      <span>{selectedTracking.from_company || 'N/A'}</span>
                    </div>
                    <div className="modal-field">
                      <strong>Recipient:</strong>
                      <span>{selectedTracking.recipient_name || 'N/A'}</span>
                    </div>
                    {selectedTracking.destination_city && selectedTracking.destination_state && (
                      <div className="modal-field">
                        <strong>Location:</strong>
                        <span>{selectedTracking.destination_city}, {selectedTracking.destination_state}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-section">
                  <h3>Dates</h3>
                  <div className="modal-grid">
                    <div className="modal-field">
                      <strong>Ship Date:</strong>
                      <span>{selectedTracking.last_updated_at ? formatDate(selectedTracking.last_updated_at) : 'N/A'}</span>
                    </div>
                    <div className="modal-field">
                      <strong>Estimated Delivery:</strong>
                      <span>{selectedTracking.estimated_delivery ? formatDate(selectedTracking.estimated_delivery) : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {additionalColumns.length > 0 && (
                  <div className="modal-section">
                    <h3>Additional Information</h3>
                    <div className="modal-grid">
                      {additionalColumns.map(column => (
                        <div key={column} className="modal-field">
                          <strong>{formatColumnName(column)}:</strong>
                          <span>{selectedTracking[column] || 'N/A'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTracking.po_number && poItemsMap.has(selectedTracking.po_number.toLowerCase()) && (
                  <div className="modal-section">
                    <h3>PO Items</h3>
                    <div className="po-items-table-wrapper">
                      <table className="po-items-table">
                        <thead>
                          <tr>
                            <th>Item Name</th>
                            <th>Part Number</th>
                            <th>Description</th>
                            <th>Color</th>
                            <th>Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {poItemsMap.get(selectedTracking.po_number.toLowerCase())?.map((item, index) => (
                            <tr key={index}>
                              <td>{item.item_name}</td>
                              <td>{item.part_number}</td>
                              <td>{item.description}</td>
                              <td>{item.color}</td>
                              <td>{item.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {Object.keys(selectedTracking).filter(key => 
                  !['id', 'tracking_number', 'slug', 'tag', 'order_id', 'po_number', 
                    'destination_city', 'destination_state', 'last_updated_at', 'estimated_delivery',
                    'checkpoint_message', 'checkpoint_location', 'checkpoint_date',
                    'recipient_name', 'from_company', 'title'].includes(key) &&
                  !additionalColumns.includes(key) &&
                  selectedTracking[key] !== null &&
                  selectedTracking[key] !== ''
                ).length > 0 && (
                  <div className="modal-section">
                    <h3>Other Details</h3>
                    <div className="modal-grid">
                      {Object.keys(selectedTracking).filter(key => 
                        !['id', 'tracking_number', 'slug', 'tag', 'order_id', 'po_number', 
                          'destination_city', 'destination_state', 'last_updated_at', 'estimated_delivery',
                          'checkpoint_message', 'checkpoint_location', 'checkpoint_date',
                          'recipient_name', 'from_company', 'title'].includes(key) &&
                        !additionalColumns.includes(key) &&
                        selectedTracking[key] !== null &&
                        selectedTracking[key] !== ''
                      ).map(key => (
                        <div key={key} className="modal-field">
                          <strong>{formatColumnName(key)}:</strong>
                          <span>{String(selectedTracking[key])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTracking.checkpoint_message && (
                  <div className="modal-section">
                    <h3>Latest Update</h3>
                    <div className="checkpoint-info">
                      <div className="checkpoint-message">{selectedTracking.checkpoint_message}</div>
                      {selectedTracking.checkpoint_location && (
                        <div className="checkpoint-location">{selectedTracking.checkpoint_location}</div>
                      )}
                      {selectedTracking.checkpoint_date && (
                        <div className="checkpoint-date">{formatDate(selectedTracking.checkpoint_date)}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
